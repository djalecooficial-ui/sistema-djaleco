import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NUVEMSHOP_API = "https://api.tiendanube.com/v1";
const WILLIAM_VENDEDOR_ID = "97f16c11-121d-47d3-9212-ece04cbcb348";

// Classifies a tracking value from Nuvemshop into the correct column.
// - 32-char hex hash → superfrete_order_id (internal SuperFrete ID)
// - 2 letters + 9 digits + 2 letters (BR) → rastreio_codigo (Correios)
// - anything else → discarded (e.g. emails, free-form notes)
function classifyTracking(raw: string | null | undefined): { rastreio_codigo: string | null; superfrete_order_id: string | null } {
  const trimmed = raw?.toString().trim();
  if (!trimmed) return { rastreio_codigo: null, superfrete_order_id: null };
  if (/^[a-f0-9]{32}$/i.test(trimmed)) return { rastreio_codigo: null, superfrete_order_id: trimmed.toLowerCase() };
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(trimmed)) return { rastreio_codigo: trimmed.toUpperCase(), superfrete_order_id: null };
  return { rastreio_codigo: null, superfrete_order_id: null };
}

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Números de celular brasileiros podem aparecer com ou sem o "nono dígito"
// (55DDD9XXXXXXXX vs 55DDDXXXXXXXX) dependendo da origem (loja vs WhatsApp).
// Sem checar as duas formas, a mesma pessoa vira dois contatos diferentes.
function telefoneAlternativo(tel: string): string | null {
  const semNono = tel.match(/^(55\d{2})9(\d{8})$/);
  if (semNono) return `${semNono[1]}${semNono[2]}`;
  const comNono = tel.match(/^(55\d{2})(\d{8})$/);
  if (comNono) return `${comNono[1]}9${comNono[2]}`;
  return null;
}

async function findOrCreateContato(supabase: any, telefoneLimpo: string, nomeCliente: string) {
  const alt = telefoneAlternativo(telefoneLimpo);
  const candidatos = alt ? [telefoneLimpo, alt] : [telefoneLimpo];
  const { data: existente } = await supabase
    .from("crm_contacts")
    .select("id, tags, status")
    .in("telefone", candidatos)
    .maybeSingle();
  if (existente) return existente as { id: string; tags: string[] | null; status: string | null };

  const { data: criado, error } = await supabase
    .from("crm_contacts")
    .insert({ nome: nomeCliente || telefoneLimpo, telefone: telefoneLimpo, origem: "site", status: "aguardando_envio" })
    .select("id, tags, status")
    .single();
  if (error) {
    const { data: retry } = await supabase
      .from("crm_contacts")
      .select("id, tags, status")
      .in("telefone", candidatos)
      .maybeSingle();
    return retry as { id: string; tags: string[] | null; status: string | null } | null;
  }
  return criado as { id: string; tags: string[] | null; status: string | null };
}

function mergeTags(atual: string[] | null | undefined, adicionar: string, removerPrefixo: string): string[] {
  const semAntigas = (atual ?? []).filter((t) => !t.startsWith(removerPrefixo));
  return Array.from(new Set([...semAntigas, adicionar]));
}

// Mesma automação do nuvemshop-webhook: quando um pedido muda pra pago
// (aqui, via sincronização manual em vez do webhook em tempo real), prepara
// a sugestão de mensagem de confirmação — NÃO envia nada sozinho, precisa de
// aprovação humana na tela da conversa.
async function prepararSugestaoPagamentoConfirmado(
  supabase: any,
  telefone: string,
  nomeCliente: string,
  numeroPedido: string,
  valor: number,
) {
  const telefoneLimpo = telefone.replace(/\D/g, "");
  const primeiroNome = (nomeCliente || "").trim().split(/\s+/)[0] || "";

  const mensagens = [
    `Oi${primeiroNome ? " " + primeiroNome : ""}! Recebemos a confirmação do pagamento do seu pedido #${numeroPedido}, no valor de ${currency(valor)}.`,
    "Já vamos começar a produção agora.",
    "O prazo é de 20 dias corridos de produção, mais o prazo de entrega dos Correios ou transportadora, que varia conforme o seu CEP.",
    "Qualquer dúvida, é só chamar por aqui.",
  ];

  const contato = await findOrCreateContato(supabase, telefoneLimpo, nomeCliente);
  if (!contato) {
    console.error("[sync/pagamento] não foi possível criar/achar contato para", telefoneLimpo);
    return;
  }

  const novasTags = mergeTags(contato.tags, `Pagamento Confirmado #${numeroPedido}`, `Pagamento Pendente #${numeroPedido}`);

  const patch: Record<string, unknown> = {
    tags: novasTags,
    pedido_confirmado_at: new Date().toISOString(),
    pedido_numero: numeroPedido,
    pedido_valor: valor,
    ai_suggestion: mensagens,
    ai_suggestion_at: new Date().toISOString(),
  };
  if (contato.status === "carrinho_abandonado") {
    patch.status = "aguardando_envio";
  }

  await supabase.from("crm_contacts").update(patch).eq("id", contato.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    // INCREMENTAL: Find the most recent updated_at from existing nuvemshop orders
    const { data: lastSynced } = await supabase
      .from("pedidos")
      .select("updated_at")
      .not("nuvemshop_order_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1);

    // Use last sync time minus 1 hour buffer, or 3 months ago for first sync
    let updatedAtMin: string;
    if (lastSynced?.length) {
      const lastDate = new Date(lastSynced[0].updated_at);
      lastDate.setHours(lastDate.getHours() - 1); // 1h buffer for safety
      updatedAtMin = lastDate.toISOString();
    } else {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      updatedAtMin = threeMonthsAgo.toISOString();
    }

    // Also always have a floor of 3 months ago
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const createdAtMin = threeMonthsAgo.toISOString();

    // Use updated_at_min to only get orders changed since last sync
    let allOrders: any[] = [];
    let page = 1;
    const perPage = 50;
    while (true) {
      const res = await fetch(
        `${baseUrl}/orders?per_page=${perPage}&page=${page}&updated_at_min=${updatedAtMin}`,
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

    console.log(`Fetched ${allOrders.length} updated orders from Nuvemshop (since ${updatedAtMin})`);

    if (allOrders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum pedido novo ou atualizado encontrado", orders_synced: 0, clients_created: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pre-fetch existing pedidos
    const nuvemshopIds = allOrders.map((o: any) => o.id).filter(Boolean);
    const { data: existingPedidos } = await supabase
      .from("pedidos")
      .select("id, nuvemshop_order_id, taxa_pagarme, taxa_ted, ted_confirmado, comissao, valor_liquido, etapa_producao, status_pagamento")
      .in("nuvemshop_order_id", nuvemshopIds);
    const pedidoMap = new Map((existingPedidos || []).map((p: any) => [p.nuvemshop_order_id, p]));

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
    let skippedOrders = 0;

    // First pass: identify new clients needed
    const newClientes: any[] = [];
    const orderClienteMap = new Map<number, number>();

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

    // Bulk insert new clients
    const newClienteIds: string[] = [];
    for (let i = 0; i < newClientes.length; i += 50) {
      const batch = newClientes.slice(i, i + 50);
      const { data: inserted, error } = await supabase.from("clientes").insert(batch).select("id, email, telefone");
      if (error) {
        console.error("Error bulk inserting clientes:", error);
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
    const orderItemsMapNew: { orderIdx: number; products: any[] }[] = [];
    // Pedidos que viraram pagos nesta sincronização — dispara a mesma
    // automação de sugestão de mensagem que o webhook em tempo real dispara.
    const pagosNestaSincronizacao: { telefone: string; nome: string; numero: string; valor: number }[] = [];

    for (let i = 0; i < allOrders.length; i++) {
      const order = allOrders[i];
      const customerName = order.customer?.name || order.contact_name || "Sem nome";
      const customerPhone = order.customer?.phone || order.contact_phone || null;
      const cidadeCliente = order.shipping_address?.city || order.billing_city || null;
      const estadoCliente = order.shipping_address?.province || order.billing_province || null;
      const enderecoCliente = [order.shipping_address?.address, order.shipping_address?.number, order.shipping_address?.floor].filter(Boolean).join(", ") || null;
      const bairroCliente = order.shipping_address?.locality || null;
      const cepCliente = order.shipping_address?.zipcode || null;

      const valorBruto = parseFloat(order.total) || 0;
      const frete = parseFloat(order.shipping_cost_customer) || parseFloat(order.shipping_cost_owner) || 0;
      const rawTracking = order.shipping_tracking_number || order.fulfillments?.[0]?.tracking_number || null;
      const { rastreio_codigo: rastreioCodigo, superfrete_order_id: superfreteOrderId } = classifyTracking(rawTracking);
      const statusPagamento = order.payment_status === "paid" ? "recebido" : "pendente";

      const existing = pedidoMap.get(order.id);

      if (existing) {
        // UPDATE: Only update non-financial fields. Preserve taxa_pagarme, taxa_ted, comissao, valor_liquido
        const updateData: any = {
          cliente_nome: customerName,
          cliente_telefone: customerPhone,
          cidade: cidadeCliente,
          estado: estadoCliente,
          endereco: enderecoCliente,
          bairro: bairroCliente,
          cep: cepCliente,
          status_pagamento: statusPagamento,
          valor_bruto: valorBruto,
          frete,
        };
        // Only update tracking fields if we got something
        if (rastreioCodigo) updateData.rastreio_codigo = rastreioCodigo;
        if (superfreteOrderId) updateData.superfrete_order_id = superfreteOrderId;
        // Sync customer note from Nuvemshop
        if (order.note) {
          updateData.observacoes_pedido = order.note;
        }

        if (statusPagamento === "recebido" && existing.status_pagamento !== "recebido" && customerPhone) {
          pagosNestaSincronizacao.push({ telefone: customerPhone, nome: customerName, numero: String(order.number || order.id), valor: valorBruto });
        }

        toUpdate.push({ id: existing.id, data: updateData });
      } else {
        // INSERT: New order with estimated fees
        const taxaPagarme = parseFloat(order.gateway_fee) || 0;
        const taxaTed = 3.67;
        const valorLiquido = valorBruto - frete - taxaPagarme - taxaTed;
        const baseComissao = valorBruto - taxaPagarme - taxaTed - frete;
        const comissao = baseComissao > 0 ? baseComissao * (taxaComissaoWilliam / 100) : 0;

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
          taxa_ted: taxaTed,
          ted_confirmado: false,
          valor_liquido: valorLiquido,
          rastreio_codigo: rastreioCodigo,
          superfrete_order_id: superfreteOrderId,
          vendedor_id: WILLIAM_VENDEDOR_ID,
          comissao,
          status_pagamento: statusPagamento,
          etapa_producao: "Comercial",
          observacoes_pedido: order.note || null,
        };

        toInsert.push({ ...pedidoData, _orderIdx: i });
        // Only add items for new orders
        if (order.products?.length) {
          orderItemsMapNew.push({ orderIdx: i, products: order.products });
        }
      }
    }

    // Bulk insert new pedidos
    const insertedPedidoMap = new Map<number, string>();
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50).map(({ _orderIdx, ...rest }) => rest);
      const orderIdxs = toInsert.slice(i, i + 50).map((p) => p._orderIdx);
      const { data: inserted, error } = await supabase.from("pedidos").insert(batch).select("id, nuvemshop_order_id");
      if (error) { console.error("Error bulk inserting pedidos:", error); }
      else if (inserted) {
        for (let j = 0; j < inserted.length; j++) {
          insertedPedidoMap.set(orderIdxs[j], inserted[j].id);
        }
      }
    }

    // Bulk update existing pedidos
    for (let i = 0; i < toUpdate.length; i += 50) {
      const batch = toUpdate.slice(i, i + 50);
      await Promise.all(batch.map(({ id, data }) =>
        supabase.from("pedidos").update(data).eq("id", id)
      ));
    }

    syncedOrders = toInsert.length + toUpdate.length;

    for (const pago of pagosNestaSincronizacao) {
      await prepararSugestaoPagamentoConfirmado(supabase, pago.telefone, pago.nome, pago.numero, pago.valor);
    }

    // Insert items only for NEW orders
    const allItems: any[] = [];
    const newPedidoIds = new Set<string>();
    for (const { orderIdx, products } of orderItemsMapNew) {
      const pedidoId = insertedPedidoMap.get(orderIdx);
      if (!pedidoId) continue;
      newPedidoIds.add(pedidoId);
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

    for (let i = 0; i < allItems.length; i += 100) {
      const { error } = await supabase.from("pedido_itens").insert(allItems.slice(i, i + 100));
      if (error) console.error("Error inserting items batch:", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sync concluído: ${toInsert.length} novos, ${toUpdate.length} atualizados, ${syncedClientes} novos clientes`,
        orders_synced: syncedOrders,
        new_orders: toInsert.length,
        updated_orders: toUpdate.length,
        clients_created: syncedClientes,
      }),
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
