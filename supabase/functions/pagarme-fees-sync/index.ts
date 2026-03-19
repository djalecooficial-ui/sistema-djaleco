import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const reqUrl = new URL(req.url);
  const resyncAll = reqUrl.searchParams.get("resync_all") === "true";

  try {
    const PAGARME_API_KEY = Deno.env.get("PAGARME_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAGARME_API_KEY) throw new Error("PAGARME_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase credentials not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = btoa(`${PAGARME_API_KEY}:`);

    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - 24);
    const createdSince = windowStart.toISOString().split("T")[0] + "T00:00:00";
    const size = 100;

    // Helper to paginate Pagar.me API
    async function fetchAllPages(baseUrl: string, label: string, maxItems = 10000) {
      const all: any[] = [];
      let page = 1;
      while (true) {
        const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}page=${page}&size=${size}`;
        const res = await fetch(url, {
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        });
        if (!res.ok) break;
        const json = await res.json();
        const items = json.data || [];
        if (!items.length) break;
        all.push(...items);
        if (items.length < size) break;
        page++;
        if (all.length > maxItems) break;
      }
      console.log(`Fetched ${all.length} ${label}`);
      return all;
    }

    // 1. Fetch payables, charges, and balance operations (transfers) in parallel
    const [allPayables, allCharges, allBalanceOps] = await Promise.all([
      fetchAllPages(
        `https://api.pagar.me/core/v5/payables?created_since=${encodeURIComponent(createdSince)}`,
        "payables"
      ),
      fetchAllPages(
        `https://api.pagar.me/core/v5/charges?created_since=${encodeURIComponent(createdSince)}`,
        "charges"
      ),
      fetchAllPages(
        `https://api.pagar.me/core/v5/balance/operations?created_since=${encodeURIComponent(createdSince)}`,
        "balance_operations"
      ),
    ]);

    // 2. Build processing fee map from payables: charge_id -> processing fee
    const feeByChargeId: Record<string, number> = {};
    const amountByChargeId: Record<string, number> = {};
    for (const p of allPayables) {
      if (p.charge_id) {
        feeByChargeId[p.charge_id] = (feeByChargeId[p.charge_id] || 0) + (p.fee / 100);
        amountByChargeId[p.charge_id] = (amountByChargeId[p.charge_id] || 0) + (p.amount / 100);
      }
    }

    // 3. Calculate transfer fees and distribute proportionally
    // Sort balance ops by created_at
    const sortedOps = allBalanceOps.sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Group payables between consecutive transfers
    // Each transfer sweeps the available balance; its fee should be split among
    // payable credits that appeared since the last transfer.
    const transferFeeByChargeId: Record<string, number> = {};
    let pendingPayableChargeIds: { chargeId: string; amount: number }[] = [];

    for (const op of sortedOps) {
      if (op.type === "payable" && op.movement_object?.charge_id) {
        pendingPayableChargeIds.push({
          chargeId: op.movement_object.charge_id,
          amount: (op.movement_object.amount || 0) / 100,
        });
      } else if (op.type === "transfer" && op.movement_object?.fee) {
        const transferFee = op.movement_object.fee / 100;
        // Distribute proportionally among pending payables
        const totalAmount = pendingPayableChargeIds.reduce((s, p) => s + p.amount, 0);
        if (totalAmount > 0 && pendingPayableChargeIds.length > 0) {
          for (const p of pendingPayableChargeIds) {
            const share = (p.amount / totalAmount) * transferFee;
            transferFeeByChargeId[p.chargeId] = (transferFeeByChargeId[p.chargeId] || 0) + share;
          }
        }
        pendingPayableChargeIds = [];
      }
    }
    console.log(`Transfer fee entries: ${Object.keys(transferFeeByChargeId).length}`);

    // 4. Build combined fee map by nuvemshop_order_id
    const feeByNuvemshopId: Record<string, { fee: number; transferFee: number; chargeAmount: number }> = {};
    for (const c of allCharges) {
      if (c.status !== "paid") continue;
      const code = String(c.order?.code || c.code || "");
      const processingFee = feeByChargeId[c.id] || 0;
      const transferFee = transferFeeByChargeId[c.id] || 0;
      if (code && (processingFee > 0 || transferFee > 0)) {
        feeByNuvemshopId[code] = {
          fee: processingFee,
          transferFee,
          chargeAmount: (c.amount || 0) / 100,
        };
      }
    }
    console.log(`Fee map entries (by nuvemshop_order_id): ${Object.keys(feeByNuvemshopId).length}`);

    // 5. Fetch pedidos that need fee sync
    // resync_all: re-process all pedidos (to add transfer fees to previously synced ones)
    // default: only pedidos with taxa_pagarme = 0
    let query = supabase
      .from("pedidos")
      .select("id, numero_pedido, nuvemshop_order_id, valor_bruto, frete, vendedor_id, origem, taxa_pagarme")
      .gt("valor_bruto", 0)
      .not("nuvemshop_order_id", "is", null);
    
    if (!resyncAll) {
      query = query.eq("taxa_pagarme", 0);
    }
    const { data: pedidos, error: pedidosError } = await query;

    if (pedidosError) throw new Error(`Error fetching pedidos: ${pedidosError.message}`);
    console.log(`Pedidos to check: ${pedidos?.length || 0}`);

    // 6. Cache vendedor rates
    const vendedorRates: Record<string, { site: number; whatsapp: number }> = {};
    const { data: vendedores } = await supabase.from("vendedores").select("id, taxa_comissao_site, taxa_comissao_whatsapp");
    if (vendedores) {
      for (const v of vendedores) {
        vendedorRates[v.id] = {
          site: v.taxa_comissao_site,
          whatsapp: v.taxa_comissao_whatsapp,
        };
      }
    }

    // 7. Match and update
    let updated = 0;
    const samples: string[] = [];

    for (const pedido of (pedidos || [])) {
      const nuvemId = String(pedido.nuvemshop_order_id);
      const match = feeByNuvemshopId[nuvemId];
      if (!match) continue;

      // Total taxa = processing fee + transfer fee
      const taxaPagarme = match.fee + match.transferFee;
      const valorBruto = Number(pedido.valor_bruto);
      const frete = Number(pedido.frete);
      const valorLiquido = valorBruto - frete - taxaPagarme;

      let comissao = 0;
      if (pedido.vendedor_id && vendedorRates[pedido.vendedor_id]) {
        const rates = vendedorRates[pedido.vendedor_id];
        const taxaComissao = pedido.origem === "whatsapp" ? rates.whatsapp : rates.site;
        const base = valorBruto - taxaPagarme - frete;
        comissao = base > 0 ? base * (taxaComissao / 100) : 0;
      }

      const { error } = await supabase
        .from("pedidos")
        .update({ taxa_pagarme: taxaPagarme, valor_liquido: valorLiquido, comissao })
        .eq("id", pedido.id);

      if (!error) {
        updated++;
        if (samples.length < 5) {
          samples.push(
            `#${pedido.numero_pedido} (ns:${nuvemId}): proc R$${match.fee.toFixed(2)} + ted R$${match.transferFee.toFixed(2)} = R$${taxaPagarme.toFixed(2)}`
          );
        }
      } else {
        console.error(`Error updating pedido ${pedido.numero_pedido}:`, error);
      }
    }

    console.log(`Updated ${updated} pedidos. Samples: ${JSON.stringify(samples)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Taxas atualizadas: ${updated} pedidos (inclui taxa de transferência TED)`,
        payables_fetched: allPayables.length,
        charges_fetched: allCharges.length,
        balance_ops_fetched: allBalanceOps.length,
        pedidos_checked: pedidos?.length || 0,
        pedidos_updated: updated,
        samples,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("pagarme-fees-sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
