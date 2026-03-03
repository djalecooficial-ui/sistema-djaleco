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

    // Expanded to 24 months
    const windowStart = new Date();
    windowStart.setMonth(windowStart.getMonth() - 24);
    const createdSince = windowStart.toISOString().split("T")[0] + "T00:00:00";
    const size = 100;

    // 1. Fetch payables (have the real fees)
    let allPayables: any[] = [];
    let page = 1;
    while (true) {
      const url = `https://api.pagar.me/core/v5/payables?page=${page}&size=${size}&created_since=${encodeURIComponent(createdSince)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      });
      if (!res.ok) break;
      const json = await res.json();
      const payables = json.data || [];
      if (!payables.length) break;
      allPayables = allPayables.concat(payables);
      if (payables.length < size) break;
      page++;
      if (allPayables.length > 10000) break;
    }
    console.log(`Fetched ${allPayables.length} payables`);

    // 2. Fetch charges
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
      if (allCharges.length > 10000) break;
    }
    console.log(`Fetched ${allCharges.length} charges`);

    // 3. Build maps
    const feeByChargeId: Record<string, number> = {};
    for (const p of allPayables) {
      if (p.charge_id && p.fee) {
        feeByChargeId[p.charge_id] = (feeByChargeId[p.charge_id] || 0) + (p.fee / 100);
      }
    }

    const feeByNuvemshopId: Record<string, { fee: number; chargeAmount: number }> = {};
    for (const c of allCharges) {
      if (c.status !== "paid") continue;
      const code = String(c.order?.code || c.code || "");
      const fee = feeByChargeId[c.id] || 0;
      if (code && fee > 0) {
        feeByNuvemshopId[code] = { fee, chargeAmount: (c.amount || 0) / 100 };
      }
    }
    console.log(`Fee map entries (by nuvemshop_order_id): ${Object.keys(feeByNuvemshopId).length}`);

    // 4. Fetch pedidos with taxa_pagarme = 0 that have nuvemshop_order_id
    // Include origem to determine correct commission rate
    const { data: pedidos, error: pedidosError } = await supabase
      .from("pedidos")
      .select("id, numero_pedido, nuvemshop_order_id, valor_bruto, frete, vendedor_id, origem")
      .eq("taxa_pagarme", 0)
      .gt("valor_bruto", 0)
      .not("nuvemshop_order_id", "is", null);

    if (pedidosError) throw new Error(`Error fetching pedidos: ${pedidosError.message}`);
    console.log(`Pedidos to check: ${pedidos?.length || 0}`);

    // 5. Cache vendedor rates (site and whatsapp)
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

    // 6. Match and update
    let updated = 0;
    const samples: string[] = [];

    for (const pedido of (pedidos || [])) {
      const nuvemId = String(pedido.nuvemshop_order_id);
      const match = feeByNuvemshopId[nuvemId];
      if (!match) continue;

      const taxaPagarme = match.fee;
      const valorBruto = Number(pedido.valor_bruto);
      const frete = Number(pedido.frete);
      const valorLiquido = valorBruto - frete - taxaPagarme;

      let comissao = 0;
      if (pedido.vendedor_id && vendedorRates[pedido.vendedor_id]) {
        const rates = vendedorRates[pedido.vendedor_id];
        // Use origin-specific rate
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
        if (samples.length < 5) samples.push(`#${pedido.numero_pedido} (ns:${nuvemId}): taxa R$${taxaPagarme.toFixed(2)}`);
      } else {
        console.error(`Error updating pedido ${pedido.numero_pedido}:`, error);
      }
    }

    console.log(`Updated ${updated} pedidos. Samples: ${JSON.stringify(samples)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Taxas atualizadas: ${updated} pedidos`,
        payables_fetched: allPayables.length,
        charges_fetched: allCharges.length,
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
