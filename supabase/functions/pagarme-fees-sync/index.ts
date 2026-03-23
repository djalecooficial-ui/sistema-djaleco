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

    // Processing fee map from payables: charge_id -> fee
    const feeByChargeId: Record<string, number> = {};
    for (const p of allPayables) {
      if (p.charge_id) {
        feeByChargeId[p.charge_id] = (feeByChargeId[p.charge_id] || 0) + (p.fee / 100);
      }
    }

    // Transfer fee map: distribute TED fees proportionally
    const transferFeeByChargeId: Record<string, number> = {};
    const sortedOps = allBalanceOps.sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let pendingPayableChargeIds: { chargeId: string; amount: number }[] = [];

    for (const op of sortedOps) {
      if (op.type === "payable" && op.movement_object?.charge_id) {
        pendingPayableChargeIds.push({
          chargeId: op.movement_object.charge_id,
          amount: (op.movement_object.amount || 0) / 100,
        });
      } else if (op.type === "transfer" && op.movement_object?.fee) {
        const transferFee = op.movement_object.fee / 100;
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

    // Build fee map by nuvemshop_order_id
    const feeByNuvemshopId: Record<string, { processingFee: number; tedFee: number }> = {};
    for (const c of allCharges) {
      if (c.status !== "paid") continue;
      const code = String(c.order?.code || c.code || "");
      const processingFee = feeByChargeId[c.id] || 0;
      const tedFee = transferFeeByChargeId[c.id] || 0;
      if (code && (processingFee > 0 || tedFee > 0)) {
        feeByNuvemshopId[code] = { processingFee, tedFee };
      }
    }
    console.log(`Fee map entries (by nuvemshop_order_id): ${Object.keys(feeByNuvemshopId).length}`);

    // Fetch pedidos to update
    let query = supabase
      .from("pedidos")
      .select("id, numero_pedido, nuvemshop_order_id, valor_bruto, frete, vendedor_id, origem, taxa_pagarme, taxa_ted, ted_confirmado")
      .gt("valor_bruto", 0)
      .not("nuvemshop_order_id", "is", null);

    if (!resyncAll) {
      // Sync pedidos that either have no processing fee or unconfirmed TED
      query = query.or("taxa_pagarme.eq.0,ted_confirmado.eq.false");
    }
    const { data: pedidos, error: pedidosError } = await query;

    if (pedidosError) throw new Error(`Error fetching pedidos: ${pedidosError.message}`);
    console.log(`Pedidos to check: ${pedidos?.length || 0}`);

    // Cache vendedor rates
    const vendedorRates: Record<string, { site: number; whatsapp: number }> = {};
    const { data: vendedores } = await supabase.from("vendedores").select("id, taxa_comissao_site, taxa_comissao_whatsapp");
    if (vendedores) {
      for (const v of vendedores) {
        vendedorRates[v.id] = { site: v.taxa_comissao_site, whatsapp: v.taxa_comissao_whatsapp };
      }
    }

    // Match and update
    let updated = 0;
    const samples: string[] = [];

    for (const pedido of (pedidos || [])) {
      const nuvemId = String(pedido.nuvemshop_order_id);
      const match = feeByNuvemshopId[nuvemId];
      if (!match) continue;

      const taxaPagarme = Math.round(match.processingFee * 100) / 100;
      const realTedFee = Math.round(match.tedFee * 100) / 100;
      const tedConfirmado = realTedFee > 0;
      // If no real TED yet, keep the estimated value (default 3.67); otherwise use real
      const currentTed = Number(pedido.taxa_ted);
      const taxaTed = tedConfirmado ? realTedFee : (currentTed > 0 ? currentTed : 3.67);

      // Skip if nothing changed
      const currentPagarme = Number(pedido.taxa_pagarme);
      if (Math.abs(taxaPagarme - currentPagarme) < 0.01 && 
          Math.abs(taxaTed - currentTed) < 0.01 && 
          pedido.ted_confirmado === tedConfirmado) continue;

      const valorBruto = Number(pedido.valor_bruto);
      const frete = Number(pedido.frete);
      const valorLiquido = valorBruto - frete - taxaPagarme - taxaTed;

      let comissao = 0;
      if (pedido.vendedor_id && vendedorRates[pedido.vendedor_id]) {
        const rates = vendedorRates[pedido.vendedor_id];
        const taxaComissao = pedido.origem === "whatsapp" ? rates.whatsapp : rates.site;
        const base = valorBruto - taxaPagarme - taxaTed - frete;
        comissao = base > 0 ? base * (taxaComissao / 100) : 0;
      }

      const { error } = await supabase
        .from("pedidos")
        .update({ taxa_pagarme: taxaPagarme, taxa_ted: taxaTed, ted_confirmado: tedConfirmado, valor_liquido: valorLiquido, comissao })
        .eq("id", pedido.id);

      if (!error) {
        updated++;
        if (samples.length < 5) {
          samples.push(
            `#${pedido.numero_pedido} (ns:${nuvemId}): proc R$${taxaPagarme.toFixed(2)} + ted R$${taxaTed.toFixed(2)} (${tedConfirmado ? "real" : "est"}) = total R$${(taxaPagarme + taxaTed).toFixed(2)}`
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
        message: `Taxas atualizadas: ${updated} pedidos (processamento + TED separados)`,
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
