import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WAIT_HOURS = 2;
// Não considera pedidos mais antigos que isso — evita marcar pedidos
// velhos/abandonados há muito tempo.
const MAX_AGE_HOURS = 48;

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
    const { data: retry } = await supabase
      .from("crm_contacts")
      .select("id, tags")
      .eq("telefone", telefoneLimpo)
      .maybeSingle();
    return retry as { id: string; tags: string[] | null } | null;
  }
  return criado as { id: string; tags: string[] | null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const limiteRecente = new Date(Date.now() - WAIT_HOURS * 60 * 60 * 1000).toISOString();
    const limiteAntigo = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();

    const { data: pendentes, error } = await supabase
      .from("pedidos")
      .select("id, numero_pedido, cliente_nome, cliente_telefone, valor_bruto, data_pedido")
      .eq("status_pagamento", "pendente")
      .is("lembrete_pagamento_enviado_at", null)
      .not("cliente_telefone", "is", null)
      .lte("data_pedido", limiteRecente)
      .gte("data_pedido", limiteAntigo)
      .limit(20);

    if (error) throw error;
    if (!pendentes || pendentes.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;

    for (const pedido of pendentes) {
      const telefone = String(pedido.cliente_telefone).replace(/\D/g, "");
      if (!telefone) continue;
      const primeiroNome = (pedido.cliente_nome || "").trim().split(/\s+/)[0] || "";

      const mensagens = [
        `Oi${primeiroNome ? " " + primeiroNome : ""}! Vi que seu pedido #${pedido.numero_pedido}, no valor de ${currency(Number(pedido.valor_bruto) || 0)}, ainda está aguardando a confirmação do pagamento.`,
        "Se precisar de ajuda para finalizar ou tiver alguma dúvida, é só me chamar por aqui.",
      ];

      const contato = await findOrCreateContato(supabase, telefone, pedido.cliente_nome);
      if (!contato) {
        console.error("[payment-reminder] não foi possível criar/achar contato para", telefone);
        continue;
      }

      const tagNova = `Pagamento Pendente #${pedido.numero_pedido}`;
      const novasTags = Array.from(new Set([...(contato.tags ?? []), tagNova]));

      // Modo sugestão: só prepara, não envia. Precisa de aprovação humana
      // na tela da conversa antes de qualquer mensagem sair pelo WhatsApp.
      await supabase
        .from("crm_contacts")
        .update({
          tags: novasTags,
          ai_suggestion: mensagens,
          ai_suggestion_at: new Date().toISOString(),
        })
        .eq("id", contato.id);

      await supabase.from("pedidos").update({ lembrete_pagamento_enviado_at: new Date().toISOString() }).eq("id", pedido.id);
      processed++;
    }

    return new Response(JSON.stringify({ processed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("nuvemshop-payment-reminder error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
