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

  try {
    const PAGARME_API_KEY = Deno.env.get("PAGARME_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!PAGARME_API_KEY) throw new Error("PAGARME_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase credentials not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = btoa(`${PAGARME_API_KEY}:`);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const createdSince = sixMonthsAgo.toISOString().split("T")[0] + "T00:00:00";

    // 1. Fetch ALL payables (recebíveis) — these have the actual fees
    let allPayables: any[] = [];
    let page = 1;
    const size = 100;

    while (true) {
      const url = `https://api.pagar.me/core/v5/payables?page=${page}&size=${size}&created_since=${encodeURIComponent(createdSince)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`Pagarme payables API error [${res.status}]: ${body}`);
        break;
      }
      const json = await res.json();
      const payables = json.data || [];
      if (!payables.length) break;
      allPayables = allPayables.concat(payables);
      if (payables.length < size) break;
      page++;
      if (allPayables.length > 5000) break;
    }

    console.log(`Fetched ${allPayables.length} payables from Pagarme`);

    // 2. Group fees by charge_id
    const feeByChargeId: Record<string, number> = {};
    const amountByChargeId: Record<string, number> = {};
    for (const p of allPayables) {
      const chargeId = p.charge_id;
      if (!chargeId) continue;
      feeByChargeId[chargeId] = (feeByChargeId[chargeId] || 0) + ((p.fee || 0) / 100);
      amountByChargeId[chargeId] = (p.amount || 0) / 100;
    }

    console.log(`Unique charge IDs with fees: ${Object.keys(feeByChargeId).length}`);

    // 3. Fetch charges to get amount + date for matching to pedidos
    let allCharges: any[] = [];
    page = 1;
    while (true) {
      const url = `https://api.pagar.me/core/v5/charges?page=${page}&size=${size}&created_since=${encodeURIComponent(createdSince)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      });
      if (!res.ok) break;
      const json = await res.json();
      const charges = json.data || [];
      if (!charges.length) break;
      allCharges = allCharges.concat(charges);
      if (charges.length < size) break;
      page++;
      if (allCharges.length > 5000) break;
    }

    console.log(`Fetched ${allCharges.length} charges from Pagarme`);

    // 4. Build lookup: charges with fee data, grouped by amount for matching
    interface ChargeWithFee {
      chargeId: string;
      amount: number; // in reais
      fee: number; // in reais
      date: string;
    }

    const chargesByAmount: Record<number, ChargeWithFee[]> = {};
    let chargesWithFee = 0;

    for (const c of allCharges) {
      if (c.status !== "paid") continue;
      const chargeId = c.id;
      const fee = feeByChargeId[chargeId];
      if (!fee || fee <= 0) continue;

      chargesWithFee++;
      const amount = (c.amount || 0) / 100;
      const amountKey = Math.round(amount * 100);

      if (!chargesByAmount[amountKey]) chargesByAmount[amountKey] = [];
      chargesByAmount[amountKey].push({
        chargeId,
        amount,
        fee,
        date: c.created_at || "",
      });
    }

    console.log(`Charges with fees: ${chargesWithFee}`);

    // 5. Fetch pedidos with taxa_pagarme = 0
    const { data: pedidos, error: pedidosError } = await supabase
      .from("pedidos")
      .select("id, numero_pedido, valor_bruto, frete, vendedor_id, data_pedido")
      .eq("taxa_pagarme", 0)
      .gt("valor_bruto", 0);

    if (pedidosError) throw new Error(`Error fetching pedidos: ${pedidosError.message}`);

    console.log(`Found ${pedidos?.length || 0} pedidos with taxa_pagarme = 0`);

    // 6. Cache vendedor rates
    const vendedorRates: Record<string, number> = {};
    const { data: vendedores } = await supabase.from("vendedores").select("id, taxa_comissao");
    if (vendedores) {
      for (const v of vendedores) vendedorRates[v.id] = v.taxa_comissao;
    }

    // 7. Match pedidos to charges by amount + date proximity
    let updated = 0;
    const usedCharges = new Set<string>();
    const matchDetails: string[] = [];

    for (const pedido of (pedidos || [])) {
      const valorBruto = Number(pedido.valor_bruto);
      const amountKey = Math.round(valorBruto * 100);
      const candidates = chargesByAmount[amountKey];

      if (!candidates?.length) continue;

      const pedidoDate = new Date(pedido.data_pedido).getTime();

      // Find closest unused charge within 3 days
      let bestMatch: ChargeWithFee | null = null;
      let bestDiff = Infinity;

      for (const candidate of candidates) {
        if (usedCharges.has(candidate.chargeId)) continue;
        const diff = Math.abs(new Date(candidate.date).getTime() - pedidoDate);
        if (diff / (1000 * 60 * 60 * 24) <= 3 && diff < bestDiff) {
          bestMatch = candidate;
          bestDiff = diff;
        }
      }

      if (!bestMatch) continue;
      usedCharges.add(bestMatch.chargeId);

      const taxaPagarme = bestMatch.fee;
      const frete = Number(pedido.frete);
      const valorLiquido = valorBruto - frete - taxaPagarme;

      let comissao = 0;
      if (pedido.vendedor_id && vendedorRates[pedido.vendedor_id] !== undefined) {
        const baseComissao = valorBruto - taxaPagarme - frete;
        comissao = baseComissao > 0 ? baseComissao * (vendedorRates[pedido.vendedor_id] / 100) : 0;
      }

      const { error } = await supabase
        .from("pedidos")
        .update({ taxa_pagarme: taxaPagarme, valor_liquido: valorLiquido, comissao })
        .eq("id", pedido.id);

      if (!error) {
        updated++;
        if (matchDetails.length < 5) {
          matchDetails.push(`#${pedido.numero_pedido}: R$${valorBruto} -> taxa R$${taxaPagarme.toFixed(2)}`);
        }
      } else {
        console.error(`Error updating pedido ${pedido.numero_pedido}:`, error);
      }
    }

    console.log(`Updated ${updated} pedidos. Samples: ${JSON.stringify(matchDetails)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Taxas atualizadas: ${updated} pedidos`,
        payables_fetched: allPayables.length,
        charges_fetched: allCharges.length,
        charges_with_fee: chargesWithFee,
        pedidos_checked: pedidos?.length || 0,
        pedidos_updated: updated,
        samples: matchDetails,
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
