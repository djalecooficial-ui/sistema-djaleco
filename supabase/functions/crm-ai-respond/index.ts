import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_HISTORY = 20;

function messageToText(m: any): string {
  if (m.media_type === "audio") {
    return m.transcription ? `[áudio transcrito] ${m.transcription}` : "[áudio sem transcrição]";
  }
  if (m.media_type) {
    return m.caption ? `[${m.media_type}] ${m.caption}` : `[${m.media_type}]`;
  }
  return m.conteudo || "";
}

async function sendWhatsAppText(telefone: string, mensagem: string) {
  const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
  const instance = Deno.env.get("EVOLUTION_CRM_INSTANCE");
  const apiKey = Deno.env.get("EVOLUTION_CRM_API_KEY");
  if (!evolutionUrl || !instance || !apiKey) {
    throw new Error("Variáveis de ambiente da Evolution não configuradas");
  }
  const number = String(telefone).replace(/\D/g, "");
  const url = `${evolutionUrl.replace(/\/$/, "")}/message/sendText/${instance}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number, text: mensagem }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`Evolution sendText falhou: ${response.status} ${JSON.stringify(result)}`);
  }
  const evolutionMessageId = result?.key?.id || result?.messageId || result?.id || null;
  return evolutionMessageId as string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { contact_id } = await req.json();
    if (!contact_id) {
      return new Response(JSON.stringify({ error: "contact_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contato, error: contatoErr } = await supabase
      .from("crm_contacts")
      .select("id, nome, telefone, ai_enabled, status")
      .eq("id", contact_id)
      .maybeSingle();
    if (contatoErr || !contato) {
      return new Response(JSON.stringify({ error: "Contato não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contato.ai_enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "ai_disabled" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: historico } = await supabase
      .from("crm_messages")
      .select("direcao, conteudo, media_type, caption, transcription, created_at")
      .eq("contact_id", contact_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);

    const conversa = (historico ?? [])
      .reverse()
      .map((m) => `${m.direcao === "recebida" ? "Cliente" : "Loja"}: ${messageToText(m)}`)
      .join("\n");

    const { data: kb } = await supabase
      .from("crm_knowledge_base")
      .select("titulo, categoria, conteudo")
      .order("categoria", { ascending: true });

    const baseConhecimento = (kb ?? [])
      .map((e) => `## ${e.titulo}${e.categoria ? ` (${e.categoria})` : ""}\n${e.conteudo}`)
      .join("\n\n");

    const systemPrompt = `Você é a atendente virtual da D.Jaleco, uma loja de jalecos e scrubs profissionais, respondendo pelo WhatsApp.

Regras obrigatórias:
1. Responda SOMENTE com base nas informações da "Base de conhecimento" abaixo. Nunca invente prazos, preços, políticas ou promessas que não estejam documentados.
2. Seja breve, cordial e direta, como uma conversa real de WhatsApp (poucas linhas, sem formalidade excessiva).
3. Se a pergunta for uma reclamação, envolver um pedido específico (rastreio, status de pagamento, problema com produto recebido) ou não estiver coberta pela base de conhecimento, você DEVE escalar para um atendente humano em vez de responder.

Responda SEMPRE em JSON puro, sem markdown, no formato exato:
{"action": "reply", "message": "texto da resposta"}
ou
{"action": "escalate", "reason": "motivo curto"}

Base de conhecimento:
${baseConhecimento || "(nenhuma informação cadastrada ainda)"}`;

    const userPrompt = `Conversa até agora (nome do cliente: ${contato.nome || contato.telefone}):\n${conversa}\n\nGere a próxima resposta da loja.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("[crm-ai-respond] gateway erro", aiResp.status, txt);
      return new Response(JSON.stringify({ error: "Falha na IA", status: aiResp.status, detail: txt }), {
        status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ai = await aiResp.json();
    const raw = (ai?.choices?.[0]?.message?.content || "").trim();

    let decision: { action: string; message?: string; reason?: string };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      decision = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (_e) {
      console.error("[crm-ai-respond] resposta não-JSON da IA:", raw);
      decision = { action: "escalate", reason: "resposta_invalida_da_ia" };
    }

    if (decision.action === "escalate") {
      await supabase
        .from("crm_contacts")
        .update({
          ai_enabled: false,
          status: contato.status === "resolvido" ? contato.status : "aguardando",
        })
        .eq("id", contact_id);

      return new Response(
        JSON.stringify({ action: "escalate", reason: decision.reason ?? null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mensagem = (decision.message || "").trim();
    if (!mensagem) {
      return new Response(JSON.stringify({ error: "IA não retornou mensagem" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evolutionMessageId = await sendWhatsAppText(contato.telefone, mensagem);

    const payload: Record<string, unknown> = {
      contact_id,
      conteudo: mensagem,
      direcao: "enviada",
      is_ai_generated: true,
    };
    if (evolutionMessageId) payload.evolution_message_id = evolutionMessageId;

    const { error: insertError } = evolutionMessageId
      ? await supabase
          .from("crm_messages")
          .upsert(payload, { onConflict: "evolution_message_id", ignoreDuplicates: true })
      : await supabase.from("crm_messages").insert(payload);
    if (insertError) console.error("[crm-ai-respond] insert error:", insertError);

    return new Response(JSON.stringify({ action: "reply", message: mensagem }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("crm-ai-respond error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
