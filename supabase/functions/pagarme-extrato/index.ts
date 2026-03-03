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
    if (!PAGARME_API_KEY) throw new Error("PAGARME_API_KEY not configured");

    const url = new URL(req.url);
    const year = url.searchParams.get("year");
    const month = url.searchParams.get("month");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    const pageParam = url.searchParams.get("page") || "1";

    // Build date filters
    let createdSince = "";
    let createdUntil = "";

    if (startDate && endDate) {
      createdSince = `${startDate}T00:00:00`;
      createdUntil = `${endDate}T23:59:59`;
    } else if (year && month) {
      const m = month.padStart(2, "0");
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      createdSince = `${year}-${m}-01T00:00:00`;
      createdUntil = `${year}-${m}-${lastDay}T23:59:59`;
    } else if (year) {
      createdSince = `${year}-01-01T00:00:00`;
      createdUntil = `${year}-12-31T23:59:59`;
    }

    const auth = btoa(`${PAGARME_API_KEY}:`);
    const size = 100;

    // Fetch charges
    let allCharges: any[] = [];
    let page = Number(pageParam);
    while (true) {
      let apiUrl = `https://api.pagar.me/core/v5/charges?page=${page}&size=${size}`;
      if (createdSince) apiUrl += `&created_since=${encodeURIComponent(createdSince)}`;
      if (createdUntil) apiUrl += `&created_until=${encodeURIComponent(createdUntil)}`;

      const res = await fetch(apiUrl, {
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Pagarme API error [${res.status}]: ${errBody}`);
      }
      const json = await res.json();
      const charges = json.data || [];
      if (!charges.length) break;
      allCharges = allCharges.concat(charges);
      if (charges.length < size) break;
      page++;
      if (allCharges.length > 2000) break;
    }

    // Fetch payables for the same period to get real fees
    let allPayables: any[] = [];
    page = 1;
    while (true) {
      let apiUrl = `https://api.pagar.me/core/v5/payables?page=${page}&size=${size}`;
      if (createdSince) apiUrl += `&created_since=${encodeURIComponent(createdSince)}`;
      if (createdUntil) apiUrl += `&created_until=${encodeURIComponent(createdUntil)}`;

      const res = await fetch(apiUrl, {
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      });
      if (!res.ok) break;
      const json = await res.json();
      const payables = json.data || [];
      if (!payables.length) break;
      allPayables = allPayables.concat(payables);
      if (payables.length < size) break;
      page++;
      if (allPayables.length > 5000) break;
    }

    // Build fee map from payables: charge_id -> total fee
    const feeByChargeId: Record<string, number> = {};
    for (const p of allPayables) {
      if (p.charge_id && p.fee) {
        feeByChargeId[p.charge_id] = (feeByChargeId[p.charge_id] || 0) + (p.fee / 100);
      }
    }

    // Format charges for frontend
    const formatted = allCharges.map((c: any) => {
      const tx = c.last_transaction || {};
      const realFee = feeByChargeId[c.id] || 0;
      const amount = (c.amount || 0) / 100;
      const paidAmount = (c.paid_amount || 0) / 100;

      return {
        id: c.id,
        created_at: c.created_at,
        paid_at: c.paid_at || (tx.acquirer_auth_code ? c.updated_at : null),
        status: c.status,
        amount,
        paid_amount: paidAmount,
        gateway_fee: realFee,
        order_code: c.order?.code || c.code || null,
        payment_method: tx.transaction_type || tx.gateway_response?.type || "unknown",
        installments: tx.installments || 1,
      };
    });

    // Summary
    const paidCharges = formatted.filter(c => c.status === "paid");
    const totalBruto = paidCharges.reduce((s, c) => s + c.amount, 0);
    const totalTaxas = paidCharges.reduce((s, c) => s + c.gateway_fee, 0);
    const totalLiquido = totalBruto - totalTaxas;

    return new Response(
      JSON.stringify({
        charges: formatted,
        summary: { total_bruto: totalBruto, total_liquido: totalLiquido, total_taxas: totalTaxas, count: formatted.length },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Pagarme extrato error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
