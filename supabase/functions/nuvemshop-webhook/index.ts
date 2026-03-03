import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NUVEMSHOP_API = "https://api.tiendanube.com/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const NUVEMSHOP_ACCESS_TOKEN = Deno.env.get("NUVEMSHOP_ACCESS_TOKEN");
    const NUVEMSHOP_STORE_ID = Deno.env.get("NUVEMSHOP_STORE_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!NUVEMSHOP_ACCESS_TOKEN || !NUVEMSHOP_STORE_ID) {
      throw new Error("Nuvemshop credentials not configured");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const body = await req.json();
    const { event, id: resourceId, store_id } = body;

    console.log(`Webhook received: ${event} for resource ${resourceId} (store ${store_id})`);

    // Only process order events
    if (!event?.startsWith("order/")) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const baseUrl = `${NUVEMSHOP_API}/${NUVEMSHOP_STORE_ID}`;
    const apiHeaders = {
      Authentication: `bearer ${NUVEMSHOP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Djaleco App (contato@djaleco.com.br)",
    };

    // Fetch full order details from Nuvemshop
    const orderRes = await fetch(`${baseUrl}/orders/${resourceId}`, {
      headers: apiHeaders,
    });
    if (!orderRes.ok) {
      const errBody = await orderRes.text();
      throw new Error(`Failed to fetch order ${resourceId} [${orderRes.status}]: ${errBody}`);
    }

    const order = await orderRes.json();
    const customerName = order.customer?.name || order.contact_name || "Sem nome";
    const customerPhone = order.customer?.phone || order.contact_phone || null;
    const customerEmail = order.customer?.email || order.contact_email || null;
    const cidadeCliente = order.shipping_address?.city || null;
    const estadoCliente = order.shipping_address?.province || null;

    // Upsert cliente
    let clienteId: string | null = null;
    if (customerEmail) {
      const { data } = await supabase.from("clientes").select("id").eq("email", customerEmail).maybeSingle();
      clienteId = data?.id || null;
    }
    if (!clienteId && customerPhone) {
      const { data } = await supabase.from("clientes").select("id").eq("telefone", customerPhone).maybeSingle();
      clienteId = data?.id || null;
    }
    if (!clienteId) {
      const { data } = await supabase.from("clientes").insert({
        nome: customerName,
        telefone: customerPhone,
        email: customerEmail,
        documento: order.customer?.identification || null,
        cidade: cidadeCliente,
        estado: estadoCliente,
        origem: "site",
      }).select("id").single();
      clienteId = data?.id || null;
    }

    const valorBruto = parseFloat(order.total) || 0;
    const frete = parseFloat(order.shipping_cost_customer) || parseFloat(order.shipping_cost_owner) || 0;
    const taxaPagarme = parseFloat(order.gateway_fee) || 0;
    const rastreioCodigo = order.shipping_tracking_number || order.fulfillments?.[0]?.tracking_number || null;

    let etapa = "Planejamento";
    if (order.status === "closed") etapa = "Entregue";
    else if (order.shipping_status === "shipped") etapa = "Despachado";
    else if (order.status === "cancelled") etapa = "Cancelado";

    const pedidoData = {
      numero_pedido: String(order.number || order.id),
      nuvemshop_order_id: order.id,
      cliente_nome: customerName,
      cliente_telefone: customerPhone,
      cidade: cidadeCliente,
      estado: estadoCliente,
      origem: "site",
      data_pedido: order.created_at,
      valor_bruto: valorBruto,
      frete,
      taxa_pagarme: taxaPagarme,
      valor_liquido: valorBruto - frete - taxaPagarme,
      rastreio_codigo: rastreioCodigo,
      etapa_producao: etapa,
    };

    const { data: existing } = await supabase
      .from("pedidos").select("id").eq("nuvemshop_order_id", order.id).maybeSingle();

    let pedidoId: string;
    if (existing) {
      const { data, error } = await supabase.from("pedidos").update(pedidoData).eq("id", existing.id).select("id").single();
      if (error) throw error;
      pedidoId = data.id;
    } else {
      const { data, error } = await supabase.from("pedidos").insert(pedidoData).select("id").single();
      if (error) throw error;
      pedidoId = data.id;
    }

    // Sync items
    if (order.products?.length) {
      await supabase.from("pedido_itens").delete().eq("pedido_id", pedidoId);
      const items = order.products.map((p: any) => ({
        pedido_id: pedidoId,
        nome_produto: p.name || "Produto",
        quantidade: p.quantity || 1,
        tamanho: p.variant_values?.[0] || null,
        cor: p.variant_values?.[1] || null,
      }));
      await supabase.from("pedido_itens").insert(items);
    }

    // Update cliente totals
    if (clienteId) {
      const { data: pedidosCliente } = await supabase
        .from("pedidos").select("valor_bruto, data_pedido").eq("cliente_nome", customerName);
      if (pedidosCliente) {
        const totalGasto = pedidosCliente.reduce((s, p) => s + Number(p.valor_bruto), 0);
        const datas = pedidosCliente.map(p => p.data_pedido).sort();
        await supabase.from("clientes").update({
          total_pedidos: pedidosCliente.length,
          total_gasto: totalGasto,
          primeira_compra: datas[0] || null,
          ultima_compra: datas[datas.length - 1] || null,
        }).eq("id", clienteId);
      }
    }

    console.log(`Webhook processed: order ${order.number} (${event})`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
