import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NUVEMSHOP_API = "https://api.tiendanube.com/v1";
const WILLIAM_VENDEDOR_ID = "97f16c11-121d-47d3-9212-ece04cbcb348";

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

    // Fetch William's commission rate
    const { data: williamData } = await supabase
      .from("vendedores")
      .select("taxa_comissao")
      .eq("id", WILLIAM_VENDEDOR_ID)
      .single();
    const taxaComissaoWilliam = williamData?.taxa_comissao ?? 10;

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

    // Pre-fetch existing data to avoid per-order queries
    const nuvemshopIds = allOrders.map((o: any) => o.id).filter(Boolean);
    const { data: existingPedidos } = await supabase
      .from("pedidos")
      .select("id, nuvemshop_order_id")
      .in("nuvemshop_order_id", nuvemshopIds);
    const pedidoMap = new Map((existingPedidos || []).map((p: any) => [p.nuvemshop_order_id, p.id]));

    // Pre-fetch all clients by email and phone
    const emails = allOrders.map((o: any) => o.customer?.email || o.contact_email).filter(Boolean);
    const phones = allOrders.map((o: any) => o.customer?.phone || o.contact_phone).filter(Boolean);
    
    const { data: clientesByEmail } = emails.length > 0
      ? await supabase.from("clientes").select("id, email, telefone").in("email", emails)
      : { data: [] };
    const { data: clientesByPhone } = phones.length > 0
      ? await supabase.from("clientes").select("id, email, telefone").in("telefone", phones)
      : { data: [] };
    
    const emailMap = new Map((clientesByEmail || []).map((c: any) => [c.email, c.id]));
    const phoneMap = new Map((clientesByPhone || []).map((c: any) => [c.telefone, c.id]));

    let syncedOrders = 0;
    let syncedClientes = 0;

    // Process in batches of 10
    const BATCH_SIZE = 10;
    for (let batchStart = 0; batchStart < allOrders.length; batchStart += BATCH_SIZE) {
      const batch = allOrders.slice(batchStart, batchStart + BATCH_SIZE);
      
      for (const order of batch) {
        const customerName = order.customer?.name || order.contact_name || "Sem nome";
        const customerPhone = order.customer?.phone || order.contact_phone || null;
        const customerEmail = order.customer?.email || order.contact_email || null;
        const customerDoc = order.customer?.identification || order.contact_identification || null;

        let clienteId: string | null = null;
        if (customerEmail) clienteId = emailMap.get(customerEmail) || null;
        if (!clienteId && customerPhone) clienteId = phoneMap.get(customerPhone) || null;

        const cidadeCliente = order.shipping_address?.city || order.billing_city || null;
        const estadoCliente = order.shipping_address?.province || order.billing_province || null;
        const enderecoCliente = order.shipping_address?.address || null;
        const bairroCliente = order.shipping_address?.locality || null;
        const cepCliente = order.shipping_address?.zipcode || null;

        if (!clienteId) {
          const { data: newCliente, error: clienteError } = await supabase
            .from("clientes")
            .insert({ nome: customerName, telefone: customerPhone, email: customerEmail, documento: customerDoc, cidade: cidadeCliente, estado: estadoCliente, endereco: enderecoCliente, bairro: bairroCliente, cep: cepCliente, origem: "site" })
            .select("id").single();
          if (clienteError) { console.error("Error creating cliente:", clienteError); }
          else {
            clienteId = newCliente.id;
            syncedClientes++;
            if (customerEmail) emailMap.set(customerEmail, clienteId);
            if (customerPhone) phoneMap.set(customerPhone, clienteId);
          }
        }

        const valorBruto = parseFloat(order.total) || 0;
        const frete = parseFloat(order.shipping_cost_customer) || parseFloat(order.shipping_cost_owner) || 0;
        const taxaPagarme = parseFloat(order.gateway_fee) || 0;
        const valorLiquido = valorBruto - frete - taxaPagarme;

        const baseComissao = valorBruto - taxaPagarme - frete;
        const comissao = baseComissao > 0 ? baseComissao * (taxaComissaoWilliam / 100) : 0;

        const rastreioCodigo = order.shipping_tracking_number || order.fulfillments?.[0]?.tracking_number || null;

        let etapa = "Planejamento";
        if (order.status === "open" && order.payment_status === "paid") etapa = "Planejamento";
        else if (order.status === "closed") etapa = "Entregue";
        else if (order.shipping_status === "shipped") etapa = "Despachado";
        else if (order.status === "cancelled") etapa = "Cancelado";

        const pedidoData: any = {
          numero_pedido: String(order.number || order.id),
          nuvemshop_order_id: order.id,
          cliente_nome: customerName,
          cliente_telefone: customerPhone,
          cidade: cidadeCliente,
          estado: estadoCliente,
          endereco: enderecoCliente,
          bairro: bairroCliente,
          cep: cepCliente,
          origem: "site",
          data_pedido: order.created_at,
          valor_bruto: valorBruto,
          frete,
          taxa_pagarme: taxaPagarme,
          valor_liquido: valorLiquido,
          rastreio_codigo: rastreioCodigo,
          etapa_producao: etapa,
          vendedor_id: WILLIAM_VENDEDOR_ID,
          comissao,
        };

        const existingId = pedidoMap.get(order.id);
        let pedidoId: string;

        if (existingId) {
          const { etapa_producao, ...updateData } = pedidoData;
          delete updateData.etapa_entrada_em;
          const { data: updated, error } = await supabase.from("pedidos").update(updateData).eq("id", existingId).select("id").single();
          if (error) { console.error("Error updating pedido:", error); continue; }
          pedidoId = updated.id;
        } else {
          const { data: created, error } = await supabase.from("pedidos").insert(pedidoData).select("id").single();
          if (error) { console.error("Error creating pedido:", error); continue; }
          pedidoId = created.id;
          pedidoMap.set(order.id, pedidoId);
        }
        syncedOrders++;

        if (order.products?.length) {
          await supabase.from("pedido_itens").delete().eq("pedido_id", pedidoId);
          const items = order.products.map((p: any) => ({
            pedido_id: pedidoId,
            nome_produto: p.name || p.product_id?.toString() || "Produto",
            quantidade: p.quantity || 1,
            tamanho: p.variant_values?.[0] || null,
            cor: p.variant_values?.[1] || null,
          }));
          const { error: itemsError } = await supabase.from("pedido_itens").insert(items);
          if (itemsError) console.error("Error inserting items:", itemsError);
        }
      }

      // Yield between batches
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Bulk update client stats at the end
    const { data: allPedidos } = await supabase.from("pedidos").select("cliente_nome, valor_bruto, data_pedido");
    if (allPedidos) {
      const statsMap = new Map<string, { count: number; total: number; first: string; last: string }>();
      for (const p of allPedidos) {
        const existing = statsMap.get(p.cliente_nome);
        if (!existing) {
          statsMap.set(p.cliente_nome, { count: 1, total: Number(p.valor_bruto), first: p.data_pedido, last: p.data_pedido });
        } else {
          existing.count++;
          existing.total += Number(p.valor_bruto);
          if (p.data_pedido < existing.first) existing.first = p.data_pedido;
          if (p.data_pedido > existing.last) existing.last = p.data_pedido;
        }
      }

      const { data: allClientes } = await supabase.from("clientes").select("id, nome");
      if (allClientes) {
        for (const cliente of allClientes) {
          const stats = statsMap.get(cliente.nome);
          if (stats) {
            await supabase.from("clientes").update({
              total_pedidos: stats.count,
              total_gasto: stats.total,
              primeira_compra: stats.first,
              ultima_compra: stats.last,
            }).eq("id", cliente.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Sync concluído: ${syncedOrders} pedidos, ${syncedClientes} novos clientes`, orders_synced: syncedOrders, clients_created: syncedClientes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
