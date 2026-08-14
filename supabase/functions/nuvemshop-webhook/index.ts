import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const NUVEMSHOP_API = "https://api.tiendanube.com/v1";
const WILLIAM_VENDEDOR_ID = "97f16c11-121d-47d3-9212-ece04cbcb348";

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

async function findOrCreateContato(supabase: any, telefoneLimpo: string, nomeCliente: string) {
  const { data: existente } = await supabase
    .from("crm_contacts")
    .select("id, tags")
    .eq("telefone", telefoneLimpo)
    .maybeSingle();
  if (existente) return existente as { id: string; tags: string[] | null };

  const { data: criado, error } = await supabase
    .from("crm_contacts")
    .insert({ nome: nomeCliente || telefoneLimpo, telefone: telefoneLimpo, origem: "site", status: "aguardando_envio" })
    .select("id, tags")
    .single();
  if (error) {
    // Corrida: outro processo criou o contato entre o select e o insert.
    const { data: retry } = await supabase
      .from("crm_contacts")
      .select("id, tags")
      .eq("telefone", telefoneLimpo)
      .maybeSingle();
    return retry as { id: string; tags: string[] | null } | null;
  }
  return criado as { id: string; tags: string[] | null };
}

function mergeTags(atual: string[] | null | undefined, adicionar: string, removerPrefixo: string): string[] {
  const semAntigas = (atual ?? []).filter((t) => !t.startsWith(removerPrefixo));
  return Array.from(new Set([...semAntigas, adicionar]));
}

// Prepara a sugestão de mensagem de boas-vindas pós-pagamento e marca o
// contato com uma tag — NÃO envia nada sozinho, precisa de aprovação humana
// na tela da conversa (mesmo fluxo "Aprovar e Enviar" das sugestões da IA).
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
    console.error("[pagamento] não foi possível criar/achar contato para", telefoneLimpo);
    return;
  }

  const novasTags = mergeTags(contato.tags, `Pagamento Confirmado #${numeroPedido}`, `Pagamento Pendente #${numeroPedido}`);

  await supabase
    .from("crm_contacts")
    .update({
      tags: novasTags,
      pedido_confirmado_at: new Date().toISOString(),
      pedido_numero: numeroPedido,
      pedido_valor: valor,
      ai_suggestion: mensagens,
      ai_suggestion_at: new Date().toISOString(),
    })
    .eq("id", contato.id);
}

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
    const rawTracking = order.shipping_tracking_number || order.fulfillments?.[0]?.tracking_number || null;
    const { rastreio_codigo: rastreioCodigo, superfrete_order_id: superfreteOrderId } = classifyTracking(rawTracking);
    const statusPagamento = order.payment_status === "paid" ? "recebido" : "pendente";

    // Fetch William's commission rate
    const { data: williamData } = await supabase
      .from("vendedores")
      .select("taxa_comissao")
      .eq("id", WILLIAM_VENDEDOR_ID)
      .single();
    const taxaComissaoWilliam = williamData?.taxa_comissao ?? 10;

    const baseComissao = valorBruto - taxaPagarme - frete;
    const comissao = baseComissao > 0 ? baseComissao * (taxaComissaoWilliam / 100) : 0;

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
      superfrete_order_id: superfreteOrderId,
      etapa_producao: etapa,
      vendedor_id: WILLIAM_VENDEDOR_ID,
      comissao,
      status_pagamento: statusPagamento,
    };

    const { data: existing } = await supabase
      .from("pedidos")
      .select("id, comissao_paga, comissao, taxa_pagarme, taxa_ted, valor_liquido, status_pagamento")
      .eq("nuvemshop_order_id", order.id)
      .maybeSingle();

    let pedidoId: string;
    if (existing) {
      // PRESERVE financial fields on update — they are managed by pagarme-fees-sync
      // and (for commissions) frozen once paid.
      const updateData: any = {
        numero_pedido: pedidoData.numero_pedido,
        cliente_nome: pedidoData.cliente_nome,
        cliente_telefone: pedidoData.cliente_telefone,
        cidade: pedidoData.cidade,
        estado: pedidoData.estado,
        data_pedido: pedidoData.data_pedido,
        valor_bruto: pedidoData.valor_bruto,
        frete: pedidoData.frete,
        rastreio_codigo: pedidoData.rastreio_codigo,
        superfrete_order_id: pedidoData.superfrete_order_id,
        etapa_producao: pedidoData.etapa_producao,
        status_pagamento: statusPagamento,
      };
      // Never overwrite paid commission. Otherwise also skip — pagarme-fees-sync owns it.
      const { data, error } = await supabase.from("pedidos").update(updateData).eq("id", existing.id).select("id").single();
      if (error) throw error;
      pedidoId = data.id;
    } else {
      const { data, error } = await supabase.from("pedidos").insert(pedidoData).select("id").single();
      if (error) throw error;
      pedidoId = data.id;
    }

    // Dispara mensagem automática de boas-vindas quando o pagamento é confirmado
    // pela primeira vez (evita reenviar em atualizações futuras do mesmo pedido).
    const statusAnterior = existing?.status_pagamento ?? null;
    if (statusPagamento === "recebido" && statusAnterior !== "recebido" && customerPhone) {
      await prepararSugestaoPagamentoConfirmado(supabase, customerPhone, customerName, pedidoData.numero_pedido, valorBruto);
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
