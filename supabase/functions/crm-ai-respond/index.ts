import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_HISTORY = 20;
const MAX_AUDIO_TO_TRANSCRIBE = 5;
const MAX_IMAGES_FOR_VISION = 3;

function messageToText(m: any): string {
  if (m.media_type === "audio") {
    return m.transcription ? `[áudio transcrito] ${m.transcription}` : "[áudio sem transcrição]";
  }
  if (m.media_type === "image") {
    return m.caption ? `[imagem anexada abaixo] ${m.caption}` : "[imagem anexada abaixo]";
  }
  if (m.media_type) {
    return m.caption ? `[${m.media_type}] ${m.caption}` : `[${m.media_type}]`;
  }
  return m.conteudo || "";
}

async function transcreverAudio(
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string,
): Promise<string | null> {
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/crm-transcribe-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ message_id: messageId }),
    });
    if (!resp.ok) {
      console.error("[crm-ai-respond] falha ao transcrever", messageId, resp.status);
      return null;
    }
    const json = await resp.json();
    return json?.transcription || null;
  } catch (e) {
    console.error("[crm-ai-respond] exceção ao transcrever", messageId, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { contact_id, feedback } = await req.json();
    if (!contact_id) {
      return new Response(JSON.stringify({ error: "contact_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contato, error: contatoErr } = await supabase
      .from("crm_contacts")
      .select("id, nome, telefone, ai_enabled, status, ai_suggestion")
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

    const { data: historicoRaw } = await supabase
      .from("crm_messages")
      .select("id, direcao, conteudo, media_type, media_url, media_mime, caption, transcription, created_at")
      .eq("contact_id", contact_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);

    const historico = (historicoRaw ?? []).reverse();

    // Transcreve automaticamente os áudios que ainda não têm transcrição,
    // pra IA "ouvir" o que o cliente mandou em vez de ver "[áudio sem transcrição]".
    const audiosPendentes = historico.filter((m) => m.media_type === "audio" && m.media_url && !m.transcription);
    for (const m of audiosPendentes.slice(-MAX_AUDIO_TO_TRANSCRIBE)) {
      const transcricao = await transcreverAudio(supabaseUrl, serviceRoleKey, m.id);
      if (transcricao) m.transcription = transcricao;
    }

    const conversa = historico
      .map((m) => `${m.direcao === "recebida" ? "Cliente" : "Loja"}: ${messageToText(m)}`)
      .join("\n");

    const { data: kb } = await supabase
      .from("crm_knowledge_base")
      .select("titulo, categoria, conteudo")
      .order("categoria", { ascending: true });

    const baseConhecimento = (kb ?? [])
      .map((e) => `## ${e.titulo}${e.categoria ? ` (${e.categoria})` : ""}\n${e.conteudo}`)
      .join("\n\n");

    const systemPrompt = `Você é Sofia, assistente virtual da Djaleco, atendendo clientes pelo WhatsApp.

Seu papel: atender de forma acolhedora, clara e profissional — tirar dúvidas, apresentar produtos e ajudar o cliente a avançar na compra. Responda com objetividade, tom amigável e linguagem simples.

Regras obrigatórias:
1. Responda SOMENTE com base na "Base de conhecimento" abaixo. Nunca invente preços, prazos, telefones ou políticas que não estejam documentados ali.
2. Responda apenas o que foi perguntado. Não acrescente informações da base de conhecimento que não tenham relação direta com a pergunta do cliente, mesmo que estejam disponíveis — seja pontual, não despeje tudo que você sabe sobre o assunto.
3. Escreva em português correto, com todos os acentos (é, ção, não, você, até, etc.) e pontuação normal, incluindo ponto de exclamação e interrogação quando fizerem sentido na frase. Isso vale mesmo que o texto da base de conhecimento abaixo esteja sem acento em algum trecho — não copie esse defeito, sempre corrija para português correto na sua resposta.
4. Não use emojis nem caracteres especiais — comunicação limpa, mas com acentuação e pontuação normais (regra 3).
5. Respostas curtas e diretas, mas completas.
6. Não repita informação que você (Loja) já deu antes nessa mesma conversa (como o número de WhatsApp, por exemplo), a menos que o cliente pergunte de novo ou peça explicitamente.
7. Se a mensagem do cliente for uma reclamação, envolver um pedido específico (rastreio, status de pagamento, problema com produto recebido) ou não estiver coberta pela base de conhecimento, você DEVE escalar para atendimento humano em vez de responder.
8. Algumas mensagens do cliente podem incluir imagens anexadas junto com a transcrição da conversa — observe o conteúdo das imagens (foto de produto, print de comprovante, etc.) ao formular sua resposta.

Formato da resposta: divida sua resposta em mensagens curtas, como uma pessoa digitando naturalmente no WhatsApp (entre 1 e 5 mensagens, nunca um texto único e longo). Responda SEMPRE em JSON puro, sem markdown, em um dos dois formatos exatos:

{"action": "reply", "messages": ["primeira mensagem", "segunda mensagem"]}
ou
{"action": "escalate", "reason": "motivo curto"}

Base de conhecimento:
${baseConhecimento || "(nenhuma informação cadastrada ainda)"}`;

    let userPromptText = `Conversa até agora (nome do cliente: ${contato.nome || contato.telefone}):\n${conversa}\n\nGere a próxima resposta da loja.`;

    if (feedback && typeof feedback === "string" && feedback.trim()) {
      const sugestaoAnterior = Array.isArray(contato.ai_suggestion)
        ? (contato.ai_suggestion as string[]).join(" / ")
        : null;
      userPromptText += `\n\nVocê já tinha sugerido esta resposta${
        sugestaoAnterior ? `: "${sugestaoAnterior}"` : ""
      }, mas o atendente humano deu o seguinte feedback sobre ela: "${feedback.trim()}". Gere uma nova sugestão levando esse feedback em conta.`;
    }

    // Monta conteúdo multimodal: texto + as imagens mais recentes da conversa,
    // pra IA realmente "ver" o que o cliente mandou (não só "[imagem]").
    const imagensRecentes = historico
      .filter((m) => m.media_type === "image" && m.media_url)
      .slice(-MAX_IMAGES_FOR_VISION);

    const userContent: any[] = [{ type: "text", text: userPromptText }];
    for (const img of imagensRecentes) {
      userContent.push({ type: "image_url", image_url: { url: img.media_url } });
    }

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
          { role: "user", content: imagensRecentes.length > 0 ? userContent : userPromptText },
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

    let decision: { action: string; messages?: string[]; reason?: string };
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
          ai_suggestion: null,
          ai_suggestion_at: new Date().toISOString(),
        })
        .eq("id", contact_id);

      return new Response(
        JSON.stringify({ action: "escalate", reason: decision.reason ?? null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mensagens = (decision.messages ?? []).map((m) => (m || "").trim()).filter(Boolean);
    if (mensagens.length === 0) {
      return new Response(JSON.stringify({ error: "IA não retornou mensagens" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo sugestão: guarda a proposta no contato para revisão humana.
    // Nada é enviado ao WhatsApp automaticamente.
    await supabase
      .from("crm_contacts")
      .update({ ai_suggestion: mensagens, ai_suggestion_at: new Date().toISOString() })
      .eq("id", contact_id);

    return new Response(JSON.stringify({ action: "reply", messages: mensagens }), {
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
