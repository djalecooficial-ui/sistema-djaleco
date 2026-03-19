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

    // Helper to paginate
    async function fetchAllPages(baseUrl: string, maxItems = 5000) {
      const all: any[] = [];
      let page = 1;
      while (true) {
        const sep = baseUrl.includes("?") ? "&" : "?";
        const res = await fetch(`${baseUrl}${sep}page=${page}&size=${size}`, {
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        });
        if (!res.ok) {
          if (page === 1) {
            const errBody = await res.text();
            throw new Error(`Pagarme API error [${res.status}]: ${errBody}`);
          }
          break;
        }
        const json = await res.json();
        const items = json.data || [];
        if (!items.length) break;
        all.push(...items);
        if (items.length < size) break;
        page++;
        if (all.length > maxItems) break;
      }
      return all;
    }

    // Build base URLs with date filters
    // Balance ops need +7 days margin because TED transfers happen after the charge
    let chargesBaseUrl = `https://api.pagar.me/core/v5/charges?`;
    let payablesBaseUrl = `https://api.pagar.me/core/v5/payables?`;
    let balanceOpsBaseUrl = `https://api.pagar.me/core/v5/balance/operations?`;
    if (createdSince) {
      const s = encodeURIComponent(createdSince);
      const u = encodeURIComponent(createdUntil);
      chargesBaseUrl += `created_since=${s}&created_until=${u}`;
      payablesBaseUrl += `created_since=${s}&created_until=${u}`;
      // Extend balance ops window by 7 days to capture TED transfers
      const extendedEnd = new Date(createdUntil.replace("T23:59:59", ""));
      extendedEnd.setDate(extendedEnd.getDate() + 7);
      const extU = encodeURIComponent(extendedEnd.toISOString().split("T")[0] + "T23:59:59");
      balanceOpsBaseUrl += `created_since=${s}&created_until=${extU}`;
    }

    // Fetch charges, payables, and balance operations in parallel
    const [allCharges, allPayables, allBalanceOps] = await Promise.all([
      fetchAllPages(chargesBaseUrl, 2000),
      fetchAllPages(payablesBaseUrl, 5000),
      fetchAllPages(balanceOpsBaseUrl, 5000),
    ]);

    // Build processing fee map from payables: charge_id -> fee
    const feeByChargeId: Record<string, number> = {};
    for (const p of allPayables) {
      if (p.charge_id && p.fee) {
        feeByChargeId[p.charge_id] = (feeByChargeId[p.charge_id] || 0) + (p.fee / 100);
      }
    }

    // Build transfer fee map by distributing TED fees proportionally
    const transferFeeByChargeId: Record<string, number> = {};
    const sortedOps = allBalanceOps.sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    let pendingPayables: { chargeId: string; amount: number }[] = [];
    for (const op of sortedOps) {
      if (op.type === "payable" && op.movement_object?.charge_id) {
        pendingPayables.push({
          chargeId: op.movement_object.charge_id,
          amount: (op.movement_object.amount || 0) / 100,
        });
      } else if (op.type === "transfer" && op.movement_object?.fee) {
        const transferFee = op.movement_object.fee / 100;
        const totalAmount = pendingPayables.reduce((s, p) => s + p.amount, 0);
        if (totalAmount > 0) {
          for (const p of pendingPayables) {
            const share = (p.amount / totalAmount) * transferFee;
            transferFeeByChargeId[p.chargeId] = (transferFeeByChargeId[p.chargeId] || 0) + share;
          }
        }
        pendingPayables = [];
      }
    }

    // Calculate total transfer fees
    const totalTransferFees = allBalanceOps
      .filter((op: any) => op.type === "transfer" && op.movement_object?.fee)
      .reduce((s: number, op: any) => s + (op.movement_object.fee / 100), 0);

    // Format charges for frontend
    const formatted = allCharges.map((c: any) => {
      const tx = c.last_transaction || {};
      const processingFee = feeByChargeId[c.id] || 0;
      const transferFee = transferFeeByChargeId[c.id] || 0;
      const totalFee = processingFee + transferFee;
      const amount = (c.amount || 0) / 100;
      const paidAmount = (c.paid_amount || 0) / 100;

      return {
        id: c.id,
        created_at: c.created_at,
        paid_at: c.paid_at || (tx.acquirer_auth_code ? c.updated_at : null),
        status: c.status,
        amount,
        paid_amount: paidAmount,
        gateway_fee: totalFee,
        processing_fee: processingFee,
        transfer_fee: transferFee,
        order_code: c.order?.code || c.code || null,
        payment_method: tx.transaction_type || tx.gateway_response?.type || "unknown",
        installments: tx.installments || 1,
      };
    });

    // Summary
    const paidCharges = formatted.filter(c => c.status === "paid");
    const totalBruto = paidCharges.reduce((s, c) => s + c.amount, 0);
    const totalProcessingFees = paidCharges.reduce((s, c) => s + c.processing_fee, 0);
    const totalTransferFeesCalc = paidCharges.reduce((s, c) => s + c.transfer_fee, 0);
    const totalTaxas = paidCharges.reduce((s, c) => s + c.gateway_fee, 0);
    const totalLiquido = totalBruto - totalTaxas;

    return new Response(
      JSON.stringify({
        charges: formatted,
        summary: {
          total_bruto: totalBruto,
          total_liquido: totalLiquido,
          total_taxas: totalTaxas,
          total_processing_fees: totalProcessingFees,
          total_transfer_fees: totalTransferFeesCalc,
          count: formatted.length,
        },
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
