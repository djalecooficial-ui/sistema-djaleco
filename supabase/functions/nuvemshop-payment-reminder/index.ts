import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WAIT_HOURS = 2;
// Não considera pedidos mais antigos que isso — evita mandar lembrete de
// pagamento "pendente" para pedidos velhos/abandonados há muito tempo.
const MAX_AGE_HOURS = 48;

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const instance = Deno.env.get("EVOLUTION_CRM_INSTANCE");
    const apiKey = Deno.env.get("EVOLUTION_CRM_API_KEY");
    if (!evolutionUrl || !instance || !apiKey) {
      return new Response(JSON.stringify({ error: "Evolution não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const baseUrl = evolutionUrl.replace(/\/$/, "");
    let processed = 0;

    for (const pedido of pendentes) {
      const telefone = String(pedido.cliente_telefone).replace(/\D/g, "");
      if (!telefone) continue;
      const primeiroNome = (pedido.cliente_nome || "").trim().split(/\s+/)[0] || "";

      const mensagens = [
        `Oi${primeiroNome ? " " + primeiroNome : ""}! Vi que seu pedido #${pedido.numero_pedido}, no valor de ${currency(Number(pedido.valor_bruto) || 0)}, ainda está aguardando a confirmação do pagamento.`,
        "Se precisar de ajuda para finalizar ou tiver alguma dúvida, é só me chamar por aqui.",
      ];

      const { data: upserted } = await supabase
        .from("crm_contacts")
        .upsert(
          { nome: pedido.cliente_nome || telefone, telefone, origem: "site", status: "novo" },
          { onConflict: "telefone", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();

      let contatoId: string | null = upserted?.id ?? null;
      if (!contatoId) {
        const { data: existente } = await supabase
          .from("crm_contacts")
          .select("id")
          .eq("telefone", telefone)
          .maybeSingle();
        contatoId = existente?.id ?? null;
      }
      if (!contatoId) continue;

      for (const texto of mensagens) {
        try {
          const resp = await fetch(`${baseUrl}/message/sendText/${instance}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: apiKey },
            body: JSON.stringify({ number: telefone, text: texto }),
          });
          const result = await resp.json();
          const evolutionMessageId = result?.key?.id || result?.messageId || result?.id || null;
          const payload: Record<string, unknown> = { contact_id: contatoId, conteudo: texto, direcao: "enviada" };
          if (evolutionMessageId) {
            payload.evolution_message_id = evolutionMessageId;
            await supabase.from("crm_messages").upsert(payload, { onConflict: "evolution_message_id", ignoreDuplicates: true });
          } else {
            await supabase.from("crm_messages").insert(payload);
          }
        } catch (e) {
          console.error("[payment-reminder] erro ao enviar", pedido.id, e);
        }
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 700));
      }

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
