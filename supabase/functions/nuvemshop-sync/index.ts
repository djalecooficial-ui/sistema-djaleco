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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const baseUrl = `${NUVEMSHOP_API}/${NUVEMSHOP_STORE_ID}`;
    const headers = {
      Authentication: `bearer ${NUVEMSHOP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Djaleco App (contato@djaleco.com.br)",
    };

    // Fetch all orders with pagination
    let allOrders: any[] = [];
    let page = 1;
    const perPage = 50;
    while (true) {
      const res = await fetch(
        `${baseUrl}/orders?per_page=${perPage}&page=${page}`,
        { headers }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Nuvemshop orders API error [${res.status}]: ${body}`);
      }
      const orders = await res.json();
      if (!orders.length) break;
      allOrders = allOrders.concat(orders);
      if (orders.length < perPage) break;
      page++;
    }

    console.log(`Fetched ${allOrders.length} orders from Nuvemshop`);

    let syncedOrders = 0;
    let syncedClientes = 0;

    for (const order of allOrders) {
      // Upsert cliente
      const customerName =
        order.customer?.name || order.contact_name || "Sem nome";
      const customerPhone =
        order.customer?.phone || order.contact_phone || null;
      const customerEmail =
        order.customer?.email || order.contact_email || null;
      const customerDoc =
        order.customer?.identification || order.contact_identification || null;

      // Check if cliente exists by name+phone or email
      let clienteId: string | null = null;
      if (customerEmail) {
        const { data: existing } = await supabase
          .from("clientes")
          .select("id")
          .eq("email", customerEmail)
          .maybeSingle();
        clienteId = existing?.id || null;
      }
      if (!clienteId && customerPhone) {
        const { data: existing } = await supabase
          .from("clientes")
          .select("id")
          .eq("telefone", customerPhone)
          .maybeSingle();
        clienteId = existing?.id || null;
      }

      const cidadeCliente =
        order.shipping_address?.city || order.billing_city || null;
      const estadoCliente =
        order.shipping_address?.province || order.billing_province || null;

      if (!clienteId) {
        const { data: newCliente, error: clienteError } = await supabase
          .from("clientes")
          .insert({
            nome: customerName,
            telefone: customerPhone,
            email: customerEmail,
            documento: customerDoc,
            cidade: cidadeCliente,
            estado: estadoCliente,
            origem: "site",
          })
          .select("id")
          .single();
        if (clienteError) {
          console.error("Error creating cliente:", clienteError);
        } else {
          clienteId = newCliente.id;
          syncedClientes++;
        }
      }

      // Parse order values
      const valorBruto = parseFloat(order.total) || 0;
      const frete =
        parseFloat(order.shipping_cost_customer) ||
        parseFloat(order.shipping_cost_owner) ||
        0;
      const taxaPagarme = parseFloat(order.gateway_fee) || 0;
      const valorLiquido = valorBruto - frete - taxaPagarme;

      // Get shipping tracking
      const rastreioCodigo =
        order.shipping_tracking_number ||
        order.fulfillments?.[0]?.tracking_number ||
        null;

      // Map Nuvemshop status to etapa
      let etapa = "Planejamento";
      if (order.status === "open" && order.payment_status === "paid") {
        etapa = "Planejamento";
      } else if (order.status === "closed") {
        etapa = "Entregue";
      } else if (order.shipping_status === "shipped") {
        etapa = "Despachado";
      } else if (order.status === "cancelled") {
        etapa = "Cancelado";
      }

      // Upsert pedido by nuvemshop_order_id
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
        valor_liquido: valorLiquido,
        rastreio_codigo: rastreioCodigo,
        etapa_producao: etapa,
      };

      const { data: existingPedido } = await supabase
        .from("pedidos")
        .select("id")
        .eq("nuvemshop_order_id", order.id)
        .maybeSingle();

      let pedidoId: string;
      if (existingPedido) {
        const { data: updated, error } = await supabase
          .from("pedidos")
          .update(pedidoData)
          .eq("id", existingPedido.id)
          .select("id")
          .single();
        if (error) {
          console.error("Error updating pedido:", error);
          continue;
        }
        pedidoId = updated.id;
      } else {
        const { data: created, error } = await supabase
          .from("pedidos")
          .insert(pedidoData)
          .select("id")
          .single();
        if (error) {
          console.error("Error creating pedido:", error);
          continue;
        }
        pedidoId = created.id;
      }
      syncedOrders++;

      // Sync order items (products)
      if (order.products?.length) {
        // Delete existing items for this order to avoid duplicates
        await supabase.from("pedido_itens").delete().eq("pedido_id", pedidoId);

        const items = order.products.map((p: any) => ({
          pedido_id: pedidoId,
          nome_produto: p.name || p.product_id?.toString() || "Produto",
          quantidade: p.quantity || 1,
          tamanho: p.variant_values?.[0] || null,
          cor: p.variant_values?.[1] || null,
        }));

        const { error: itemsError } = await supabase
          .from("pedido_itens")
          .insert(items);
        if (itemsError) {
          console.error("Error inserting items:", itemsError);
        }
      }

      // Update cliente totals
      if (clienteId) {
        const { data: pedidosCliente } = await supabase
          .from("pedidos")
          .select("valor_bruto, data_pedido")
          .eq("cliente_nome", customerName);

        if (pedidosCliente) {
          const totalGasto = pedidosCliente.reduce(
            (s, p) => s + Number(p.valor_bruto),
            0
          );
          const datas = pedidosCliente.map((p) => p.data_pedido).sort();
          await supabase
            .from("clientes")
            .update({
              total_pedidos: pedidosCliente.length,
              total_gasto: totalGasto,
              primeira_compra: datas[0] || null,
              ultima_compra: datas[datas.length - 1] || null,
            })
            .eq("id", clienteId);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync concluído: ${syncedOrders} pedidos, ${syncedClientes} novos clientes`,
        orders_synced: syncedOrders,
        clients_created: syncedClientes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
