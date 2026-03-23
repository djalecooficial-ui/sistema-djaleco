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

    // Fetch orders from the last 3 months only to avoid WORKER_LIMIT
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const createdAtMin = threeMonthsAgo.toISOString();

    let allOrders: any[] = [];
    let page = 1;
    const perPage = 50;
    while (true) {
      const res = await fetch(
        `${baseUrl}/orders?per_page=${perPage}&page=${page}&created_at_min=${createdAtMin}`,
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

    // Pre-fetch existing pedidos
    const nuvemshopIds = allOrders.map((o: any) => o.id).filter(Boolean);
    const { data: existingPedidos } = await supabase
      .from("pedidos")
      .select("id, nuvemshop_order_id")
      .in("nuvemshop_order_id", nuvemshopIds);
    const pedidoMap = new Map((existingPedidos || []).map((p: any) => [p.nuvemshop_order_id, p.id]));

    // Pre-fetch clients
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

    // Prepare all data first, then do bulk operations
    const newClientes: any[] = [];
    const orderClienteMap = new Map<number, number>(); // order index -> newClientes index

    // First pass: identify new clients needed
    for (let i = 0; i < allOrders.length; i++) {
      const order = allOrders[i];
      const customerEmail = order.customer?.email || order.contact_email || null;
      const customerPhone = order.customer?.phone || order.contact_phone || null;
      let clienteId: string | null = null;
      if (customerEmail) clienteId = emailMap.get(customerEmail) || null;
      if (!clienteId && customerPhone) clienteId = phoneMap.get(customerPhone) || null;

      if (!clienteId) {
        const customerName = order.customer?.name || order.contact_name || "Sem nome";
        const customerDoc = order.customer?.identification || order.contact_identification || null;
        const cidadeCliente = order.shipping_address?.city || order.billing_city || null;
        const estadoCliente = order.shipping_address?.province || order.billing_province || null;
        const enderecoCliente = [order.shipping_address?.address, order.shipping_address?.number, order.shipping_address?.floor].filter(Boolean).join(", ") || null;
        const bairroCliente = order.shipping_address?.locality || null;
        const cepCliente = order.shipping_address?.zipcode || null;

        // Check if we already queued this client
        const existingIdx = newClientes.findIndex((c) =>
          (customerEmail && c.email === customerEmail) || (customerPhone && c.telefone === customerPhone)
        );
        if (existingIdx === -1) {
          orderClienteMap.set(i, newClientes.length);
          newClientes.push({ nome: customerName, telefone: customerPhone, email: customerEmail, documento: customerDoc, cidade: cidadeCliente, estado: estadoCliente, endereco: enderecoCliente, bairro: bairroCliente, cep: cepCliente, origem: "site" });
        } else {
          orderClienteMap.set(i, existingIdx);
        }
      }
    }

    // Bulk insert new clients in batches of 50
    const newClienteIds: string[] = [];
    for (let i = 0; i < newClientes.length; i += 50) {
      const batch = newClientes.slice(i, i + 50);
      const { data: inserted, error } = await supabase.from("clientes").insert(batch).select("id, email, telefone");
      if (error) {
        console.error("Error bulk inserting clientes:", error);
        // Insert individually as fallback
        for (const c of batch) {
          const { data: single, error: sErr } = await supabase.from("clientes").insert(c).select("id").single();
          if (sErr) { console.error("Error creating cliente:", sErr); newClienteIds.push(""); }
          else { newClienteIds.push(single.id); syncedClientes++; }
        }
      } else if (inserted) {
        for (const c of inserted) {
          newClienteIds.push(c.id);
          if (c.email) emailMap.set(c.email, c.id);
          if (c.telefone) phoneMap.set(c.telefone, c.id);
          syncedClientes++;
        }
      }
    }

    // Second pass: prepare pedido data
    const toInsert: any[] = [];
    const toUpdate: { id: string; data: any }[] = [];
    const orderItemsMap: { orderIdx: number; products: any[] }[] = [];

    for (let i = 0; i < allOrders.length; i++) {
      const order = allOrders[i];
      const customerName = order.customer?.name || order.contact_name || "Sem nome";
      const customerPhone = order.customer?.phone || order.contact_phone || null;
      const customerEmail = order.customer?.email || order.contact_email || null;
      const cidadeCliente = order.shipping_address?.city || order.billing_city || null;
      const estadoCliente = order.shipping_address?.province || order.billing_province || null;
      const enderecoCliente = [order.shipping_address?.address, order.shipping_address?.number, order.shipping_address?.floor].filter(Boolean).join(", ") || null;
      const bairroCliente = order.shipping_address?.locality || null;
      const cepCliente = order.shipping_address?.zipcode || null;

      const valorBruto = parseFloat(order.total) || 0;
      const frete = parseFloat(order.shipping_cost_customer) || parseFloat(order.shipping_cost_owner) || 0;
      const taxaPagarme = parseFloat(order.gateway_fee) || 0;
      const taxaTed = 3.67; // Estimated TED fee for new orders
      const valorLiquido = valorBruto - frete - taxaPagarme - taxaTed;
      const baseComissao = valorBruto - taxaPagarme - taxaTed - frete;
      const comissao = baseComissao > 0 ? baseComissao * (taxaComissaoWilliam / 100) : 0;
      const rastreioCodigo = order.shipping_tracking_number || order.fulfillments?.[0]?.tracking_number || null;

      const etapa = "Comercial";

      const statusPagamento = order.payment_status === "paid" ? "recebido" : "pendente";

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
        vendedor_id: WILLIAM_VENDEDOR_ID,
        comissao,
        status_pagamento: statusPagamento,
      };

      const existingId = pedidoMap.get(order.id);
      if (existingId) {
        toUpdate.push({ id: existingId, data: pedidoData });
      } else {
        pedidoData.etapa_producao = etapa;
        toInsert.push({ ...pedidoData, _orderIdx: i });
      }

      if (order.products?.length) {
        orderItemsMap.push({ orderIdx: i, products: order.products });
      }
    }

    // Bulk insert new pedidos in batches of 50
    const insertedPedidoMap = new Map<number, string>(); // orderIdx -> pedido id
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50).map(({ _orderIdx, ...rest }) => rest);
      const orderIdxs = toInsert.slice(i, i + 50).map((p) => p._orderIdx);
      const { data: inserted, error } = await supabase.from("pedidos").insert(batch).select("id, nuvemshop_order_id");
      if (error) { console.error("Error bulk inserting pedidos:", error); }
      else if (inserted) {
        for (let j = 0; j < inserted.length; j++) {
          insertedPedidoMap.set(orderIdxs[j], inserted[j].id);
          pedidoMap.set(inserted[j].nuvemshop_order_id, inserted[j].id);
          syncedOrders++;
        }
      }
    }

    // Bulk update existing pedidos in batches of 50
    for (let i = 0; i < toUpdate.length; i += 50) {
      const batch = toUpdate.slice(i, i + 50);
      // Unfortunately Supabase doesn't support bulk update by different IDs, so we do individual updates
      // but we can Promise.all them
      await Promise.all(batch.map(({ id, data }) => {
        const { etapa_producao, etapa_entrada_em, ...updateData } = data;
        return supabase.from("pedidos").update(updateData).eq("id", id);
      }));
      syncedOrders += batch.length;
    }

    // Bulk handle items: delete old items and insert new ones
    const allPedidoIds = new Set<string>();
    const allItems: any[] = [];
    for (const { orderIdx, products } of orderItemsMap) {
      const pedidoId = insertedPedidoMap.get(orderIdx) || pedidoMap.get(allOrders[orderIdx].id);
      if (!pedidoId) continue;
      allPedidoIds.add(pedidoId);
      for (const p of products) {
        allItems.push({
          pedido_id: pedidoId,
          nome_produto: p.name || p.product_id?.toString() || "Produto",
          quantidade: p.quantity || 1,
          tamanho: p.variant_values?.[0] || null,
          cor: p.variant_values?.[1] || null,
        });
      }
    }

    // Delete old items in batches
    const pedidoIdArr = Array.from(allPedidoIds);
    for (let i = 0; i < pedidoIdArr.length; i += 100) {
      await supabase.from("pedido_itens").delete().in("pedido_id", pedidoIdArr.slice(i, i + 100));
    }
    // Insert new items in batches
    for (let i = 0; i < allItems.length; i += 100) {
      const { error } = await supabase.from("pedido_itens").insert(allItems.slice(i, i + 100));
      if (error) console.error("Error inserting items batch:", error);
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
