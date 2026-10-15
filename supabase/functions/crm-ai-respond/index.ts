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

async function enviarTexto(
  baseUrl: string,
  instance: string,
  apiKey: string,
  number: string,
  texto: string,
): Promise<string | null> {
  const resp = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number, text: texto }),
  });
  const result = await resp.json().catch(() => ({}));
  return result?.key?.id || result?.messageId || result?.id || null;
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
      .select("id, nome, telefone, ai_enabled, ai_auto_send, status, ai_suggestion")
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

    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const instance = Deno.env.get("EVOLUTION_CRM_INSTANCE");
    const apiKey = Deno.env.get("EVOLUTION_CRM_API_KEY");
    const baseUrl = evolutionUrl?.replace(/\/$/, "") ?? "";
    const numeroCliente = String(contato.telefone).replace(/\D/g, "");

    const { data: staffSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "staff_notificacao_telefone")
      .maybeSingle();
    const numeroStaff = staffSetting?.value ? String(staffSetting.value).replace(/\D/g, "") : null;

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

    const { data: exemplos } = await supabase
      .from("crm_response_examples")
      .select("pergunta_cliente, resposta_humana")
      .order("created_at", { ascending: false })
      .limit(15);

    const exemplosTexto = (exemplos ?? [])
      .reverse()
      .map((e) => `Cliente: ${e.pergunta_cliente}\nAtendente: ${e.resposta_humana}`)
      .join("\n\n");

    const { data: anexosDisponiveis } = await supabase
      .from("crm_attachments")
      .select("id, titulo, categoria, file_url, file_mime, file_name");

    const anexosTexto = (anexosDisponiveis ?? [])
      .map((a) => `- id: ${a.id} | título: ${a.titulo}${a.categoria ? ` | categoria: ${a.categoria}` : ""}`)
      .join("\n");

    const systemPrompt = `Você é Sofia, assistente virtual da Djaleco, atendendo clientes pelo WhatsApp.

Seu papel: atender de forma acolhedora, clara e profissional — tirar dúvidas, apresentar produtos e ajudar o cliente a avançar na compra. Responda com objetividade, tom amigável e linguagem simples.

Regras obrigatórias:
1. Responda SOMENTE com base na "Base de conhecimento" abaixo. Nunca invente preços, prazos, telefones ou políticas que não estejam documentados ali.
2. Responda apenas o que foi perguntado. Não acrescente informações da base de conhecimento que não tenham relação direta com a pergunta do cliente, mesmo que estejam disponíveis — seja pontual, não despeje tudo que você sabe sobre o assunto.
3. Escreva em português correto, com todos os acentos (é, ção, não, você, até, etc.) e pontuação normal, incluindo ponto de exclamação e interrogação quando fizerem sentido na frase. Isso vale mesmo que o texto da base de conhecimento abaixo esteja sem acento em algum trecho — não copie esse defeito, sempre corrija para português correto na sua resposta.
4. Não use emojis nem caracteres especiais — comunicação limpa, mas com acentuação e pontuação normais (regra 3).
5. Respostas curtas e diretas, mas completas.
6. Não repita informação que você (Loja) já deu antes nessa mesma conversa (como o número de WhatsApp, por exemplo), a menos que o cliente pergunte de novo ou peça explicitamente.
7. Se a mensagem do cliente for uma reclamação, envolver um pedido específico (rastreio, status de pagamento, problema com produto recebido) ou não estiver coberta pela base de conhecimento, você DEVE escalar para atendimento humano em vez de responder. Ao escalar, SEMPRE inclua "reply_to_customer" com 1-2 mensagens curtas, naturais e específicas à pergunta dele, avisando que você vai verificar essa informação e que alguém da equipe vai entrar em contato em breve — nunca deixe o cliente sem nenhuma resposta.
8. Algumas mensagens do cliente podem incluir imagens anexadas junto com a transcrição da conversa — observe o conteúdo das imagens (foto de produto, print de comprovante, etc.) ao formular sua resposta.
9. Abaixo, em "Exemplos de respostas do atendente", há conversas reais em que um atendente humano respondeu clientes. Use esses exemplos como referência de tom, vocabulário e jeito de escrever — imite o estilo real da equipe, não um tom genérico de robô. Nunca copie o conteúdo factual desses exemplos para outra pergunta, use-os só para aprender COMO escrever, não O QUE dizer.
10. Se o cliente pedir catálogo, fotos de produtos, tabela de preços/tamanhos ou qualquer material parecido com algo da lista "Anexos disponíveis" abaixo, inclua o campo "anexo_id" na resposta com o id exato daquele anexo, e mencione nas mensagens que você está enviando o arquivo. Se nada da lista corresponder ao pedido, ou se o cliente não pediu nenhum material, deixe "anexo_id" como null. Nunca invente um id que não esteja na lista.

Formato da resposta: divida sua resposta em mensagens curtas, como uma pessoa digitando naturalmente no WhatsApp (entre 1 e 5 mensagens, nunca um texto único e longo). Responda SEMPRE em JSON puro, sem markdown, em um dos dois formatos exatos:

{"action": "reply", "messages": ["primeira mensagem", "segunda mensagem"], "anexo_id": "id do anexo ou null"}
ou
{"action": "escalate", "reason": "motivo curto", "reply_to_customer": ["mensagem avisando que vai verificar e a equipe retorna"]}

${exemplosTexto ? `Exemplos de respostas do atendente (imite o estilo, não copie o conteúdo):\n${exemplosTexto}\n` : ""}
Anexos disponíveis (arquivos que você pode anexar e enviar quando o cliente pedir):
${anexosTexto || "(nenhum anexo cadastrado ainda)"}

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

    let decision: {
      action: string;
      messages?: string[];
      reason?: string;
      anexo_id?: string | null;
      reply_to_customer?: string[];
    };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      decision = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (_e) {
      console.error("[crm-ai-respond] resposta não-JSON da IA:", raw);
      decision = { action: "escalate", reason: "resposta_invalida_da_ia" };
    }

    if (decision.action === "escalate") {
      const respostaEspera = (decision.reply_to_customer ?? []).map((m) => (m || "").trim()).filter(Boolean);
      const podeEnviar = !!evolutionUrl && !!instance && !!apiKey;

      // Modo automático de teste: já manda a resposta de espera pro cliente.
      // Modo normal (toda a base real): ela fica como sugestão esperando
      // aprovação humana — nunca sai sozinha pra cliente real.
      if (contato.ai_auto_send && respostaEspera.length > 0 && podeEnviar) {
        for (let i = 0; i < respostaEspera.length; i++) {
          const texto = respostaEspera[i];
          const evolutionMessageId = await enviarTexto(baseUrl, instance!, apiKey!, numeroCliente, texto);
          await supabase.from("crm_messages").insert({
            contact_id,
            conteudo: texto,
            direcao: "enviada",
            is_ai_generated: true,
            ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
          });
          if (i < respostaEspera.length - 1) {
            await new Promise((r) => setTimeout(r, 1200 + Math.random() * 900));
          }
        }
      }

      await supabase
        .from("crm_contacts")
        .update({
          ai_enabled: false,
          // "aguardando_cliente" é a coluna real do quadro WhatsApp — "aguardando"
          // (valor antigo) não existe em nenhuma coluna e deixava o contato
          // invisível no Kanban.
          status: contato.status === "resolvido" ? contato.status : "aguardando_cliente",
          ai_suggestion: contato.ai_auto_send ? null : (respostaEspera.length > 0 ? respostaEspera : null),
          ai_suggestion_anexo_id: null,
          ai_suggestion_at: new Date().toISOString(),
        })
        .eq("id", contact_id);

      // Avisa a equipe por WhatsApp que a Sofia precisou escalar — aviso
      // interno, não é mensagem pro cliente, então não passa por aprovação.
      if (numeroStaff && podeEnviar) {
        const ultimaMsgCliente = [...historico].reverse().find((m) => m.direcao === "recebida");
        const perguntaTexto = ultimaMsgCliente ? messageToText(ultimaMsgCliente) : "(sem mensagem recente)";
        const avisoLinhas = [
          "A Sofia precisou escalar uma conversa para atendimento humano.",
          `Cliente: ${contato.nome || contato.telefone} (${contato.telefone})`,
          `Pergunta: ${perguntaTexto}`,
          decision.reason ? `Motivo: ${decision.reason}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        try {
          await enviarTexto(baseUrl, instance!, apiKey!, numeroStaff, avisoLinhas);
        } catch (e) {
          console.error("[crm-ai-respond] falha ao notificar staff", e);
        }
      }

      return new Response(
        JSON.stringify({ action: "escalate", reason: decision.reason ?? null, reply_to_customer: respostaEspera }),
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

    // Só aceita o anexo_id se ele realmente existir na lista que foi
    // oferecida pra IA — nunca confia em um id "inventado" pela resposta.
    const anexoSugerido = decision.anexo_id
      ? (anexosDisponiveis ?? []).find((a) => a.id === decision.anexo_id) ?? null
      : null;

    // Modo teste: só para contatos com ai_auto_send=true (ligado manualmente
    // por um admin, número a número), a IA responde E ENVIA sozinha pelo
    // WhatsApp, sem aprovação humana. Para todo o resto da base, continua
    // sendo sempre modo sugestão — nada sai sem aprovação.
    if (contato.ai_auto_send) {
      if (!evolutionUrl || !instance || !apiKey) {
        throw new Error("Variáveis do Evolution API não configuradas");
      }
      const number = numeroCliente;

      for (let i = 0; i < mensagens.length; i++) {
        const texto = mensagens[i];
        const evolutionMessageId = await enviarTexto(baseUrl, instance, apiKey, number, texto);

        await supabase.from("crm_messages").insert({
          contact_id,
          conteudo: texto,
          direcao: "enviada",
          is_ai_generated: true,
          ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
        });

        if (i < mensagens.length - 1 || anexoSugerido) {
          await new Promise((r) => setTimeout(r, 1200 + Math.random() * 900));
        }
      }

      if (anexoSugerido) {
        const mediaType = anexoSugerido.file_mime?.startsWith("image/")
          ? "image"
          : anexoSugerido.file_mime?.startsWith("video/")
          ? "video"
          : "document";
        const mediaResp = await fetch(`${baseUrl}/message/sendMedia/${instance}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify({
            number,
            mediatype: mediaType,
            media: anexoSugerido.file_url,
            fileName: anexoSugerido.file_name,
          }),
        });
        const mediaResult = await mediaResp.json().catch(() => ({}));
        const mediaEvolutionId = mediaResult?.key?.id || mediaResult?.messageId || mediaResult?.id || null;

        await supabase.from("crm_messages").insert({
          contact_id,
          conteudo: "",
          direcao: "enviada",
          is_ai_generated: true,
          media_type: mediaType,
          media_mime: anexoSugerido.file_mime,
          media_url: anexoSugerido.file_url,
          media_filename: anexoSugerido.file_name,
          ...(mediaEvolutionId ? { evolution_message_id: mediaEvolutionId } : {}),
        });
      }

      return new Response(JSON.stringify({ action: "auto_sent", messages: mensagens, anexo: anexoSugerido?.titulo ?? null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo sugestão: guarda a proposta no contato para revisão humana.
    // Nada é enviado ao WhatsApp automaticamente.
    await supabase
      .from("crm_contacts")
      .update({
        ai_suggestion: mensagens,
        ai_suggestion_at: new Date().toISOString(),
        ai_suggestion_anexo_id: anexoSugerido?.id ?? null,
      })
      .eq("id", contact_id);

    return new Response(JSON.stringify({ action: "reply", messages: mensagens, anexo: anexoSugerido?.titulo ?? null }), {
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
