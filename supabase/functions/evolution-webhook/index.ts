import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "crm-media";

async function fetchProfilePicture(
  evolutionUrl: string,
  instance: string,
  apiKey: string,
  number: string,
): Promise<string | null> {
  try {
    const url = `${evolutionUrl.replace(/\/$/, "")}/chat/fetchProfilePictureUrl/${instance}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.profilePictureUrl || json?.url || null;
  } catch (e) {
    console.error("[profilePic] erro", e);
    return null;
  }
}

const MEDIA_KEYS = [
  ["imageMessage", "image"],
  ["videoMessage", "video"],
  ["audioMessage", "audio"],
  ["documentMessage", "document"],
  ["stickerMessage", "sticker"],
  ["documentWithCaptionMessage", "document"],
] as const;

// Números de celular brasileiros podem chegar com ou sem o "nono dígito"
// (55DDD9XXXXXXXX vs 55DDDXXXXXXXX). Sem checar as duas formas, a mesma
// pessoa pode virar dois contatos diferentes (ex: pedido do site vs WhatsApp).
function telefoneAlternativo(tel: string): string | null {
  const semNono = tel.match(/^(55\d{2})9(\d{8})$/);
  if (semNono) return `${semNono[1]}${semNono[2]}`;
  const comNono = tel.match(/^(55\d{2})(\d{8})$/);
  if (comNono) return `${comNono[1]}9${comNono[2]}`;
  return null;
}

function extractMediaInfo(message: any) {
  if (!message) return null;
  for (const [key, type] of MEDIA_KEYS) {
    const node =
      message[key] ||
      message?.documentWithCaptionMessage?.message?.documentMessage;
    if (node) {
      return {
        type,
        mimetype: node.mimetype || null,
        caption: node.caption || null,
        filename: node.fileName || node.title || null,
      };
    }
  }
  return null;
}

function extOf(mime: string | null, fallback: string) {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
  };
  if (map[mime]) return map[mime];
  const sub = mime.split("/")[1];
  return sub ? sub.split(";")[0] : fallback;
}

async function ensureBucket(supabase: any) {
  try {
    await supabase.storage.createBucket(BUCKET, { public: true });
  } catch (_) { /* ignore - já existe */ }
}

async function downloadAndStoreMedia(
  supabase: any,
  evolutionUrl: string,
  instance: string,
  apiKey: string,
  keyObj: any,
  contactId: string,
  messageId: string,
  mediaType: string,
  mimeHint: string | null,
) {
  try {
    const url = `${evolutionUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instance}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ message: { key: keyObj }, convertToMp4: false }),
    });
    if (!resp.ok) {
      console.error("[media] getBase64 falhou", resp.status, await resp.text());
      return null;
    }
    const json = await resp.json();
    const base64 = json?.base64 || json?.data?.base64 || json?.media;
    const mime = json?.mimetype || json?.mediaType || mimeHint || "application/octet-stream";
    if (!base64) {
      console.error("[media] sem base64 na resposta", Object.keys(json || {}));
      return null;
    }
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ext = extOf(mime, "bin");
    const path = `${contactId}/${messageId}.${ext}`;
    await ensureBucket(supabase);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (error) {
      console.error("[media] upload erro", error);
      return null;
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, mime };
  } catch (e) {
    console.error("[media] exceção", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    if (body.event !== "MESSAGES_UPSERT" && body.event !== "messages.upsert") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    // Suporta ambos os formatos v1 e v2 da Evolution API
    const msgData = body.data?.message || body.data;
    const telefone = (body.data?.key?.remoteJid || msgData?.key?.remoteJid || "")
      .replace("@s.whatsapp.net", "")
      .replace("@c.us", "");

    const innerMessage =
      body.data?.message || msgData?.message || null;
    const textoConteudo =
      innerMessage?.conversation ||
      innerMessage?.extendedTextMessage?.text ||
      null;
    const mediaInfo = extractMediaInfo(innerMessage);
    const conteudo = textoConteudo ?? mediaInfo?.caption ?? (mediaInfo ? "" : "[mídia]");

    const nomeWhats = body.data?.pushName || msgData?.pushName || "";
    const fromMe = body.data?.key?.fromMe ?? msgData?.key?.fromMe ?? false;
    const evolutionMessageId =
      body.data?.key?.id || msgData?.key?.id || null;
    const keyObj = body.data?.key || msgData?.key || null;

    if (!telefone) {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const instance = Deno.env.get("EVOLUTION_CRM_INSTANCE");
    const apiKey = Deno.env.get("EVOLUTION_CRM_API_KEY");

    // Verifica primeiro se o contato já existe em qualquer uma das duas
    // formas do telefone (com/sem o nono dígito) antes de criar um novo.
    const telefoneAlt = telefoneAlternativo(telefone);
    const telefoneCandidatos = telefoneAlt ? [telefone, telefoneAlt] : [telefone];

    const { data: existentePreCheck } = await supabase
      .from("crm_contacts")
      .select("id, status, origem, avatar_url, push_name")
      .in("telefone", telefoneCandidatos)
      .maybeSingle();

    let contato = existentePreCheck;

    if (!contato) {
      // Não existe em nenhuma das formas: cria com upsert atômico (ON CONFLICT
      // DO NOTHING via ignoreDuplicates) pra evitar duplicar se duas mensagens
      // do mesmo número chegarem quase ao mesmo tempo.
      const { data: upserted } = await supabase
        .from("crm_contacts")
        .upsert(
          {
            nome: nomeWhats || telefone,
            push_name: nomeWhats || null,
            telefone,
            origem: "whatsapp",
            status: "novo",
          },
          { onConflict: "telefone", ignoreDuplicates: true },
        )
        .select("id, status, origem, avatar_url, push_name")
        .maybeSingle();
      contato = upserted;

      if (!contato) {
        // Corrida: outro processo criou o contato entre o check e o upsert.
        const { data: retry } = await supabase
          .from("crm_contacts")
          .select("id, status, origem, avatar_url, push_name")
          .in("telefone", telefoneCandidatos)
          .maybeSingle();
        contato = retry;
      }
    }

    if (contato) {
      // Atualiza push_name se mudou e tenta buscar avatar se ainda não temos
      const patch: Record<string, unknown> = {};
      if (nomeWhats && nomeWhats !== contato.push_name) {
        patch.push_name = nomeWhats;
      }
      if (!contato.avatar_url && evolutionUrl && instance && apiKey) {
        const avatarUrl = await fetchProfilePicture(evolutionUrl, instance, apiKey, telefone);
        if (avatarUrl) patch.avatar_url = avatarUrl;
      }
      if (Object.keys(patch).length > 0) {
        await supabase.from("crm_contacts").update(patch).eq("id", contato.id);
      }
    }

    const direcao = fromMe ? "enviada" : "recebida";

    // Cliente do site respondeu: avança automaticamente pra coluna
    // "Cliente Respondeu" no quadro de Pedidos do Site, pra não ficar
    // escondido em "Aguardando Envio"/"Confirmação Enviada".
    if (
      direcao === "recebida" &&
      contato?.origem === "site" &&
      (contato.status === "aguardando_envio" || contato.status === "confirmacao_enviada")
    ) {
      await supabase.from("crm_contacts").update({ status: "cliente_respondeu" }).eq("id", contato.id);
    }

    // Faz download da mídia (se houver) antes de inserir
    let mediaUrl: string | null = null;
    let mediaMime: string | null = mediaInfo?.mimetype ?? null;
    if (mediaInfo && keyObj && evolutionMessageId) {
      if (evolutionUrl && instance && apiKey) {
        const stored = await downloadAndStoreMedia(
          supabase,
          evolutionUrl,
          instance,
          apiKey,
          keyObj,
          contato!.id,
          evolutionMessageId,
          mediaInfo.type,
          mediaInfo.mimetype,
        );
        if (stored) {
          mediaUrl = stored.url;
          mediaMime = stored.mime;
        }
      }
    }

    // Upsert by evolution_message_id to avoid duplicates when CRM-sent messages
    // come back through the webhook.
    const payload: Record<string, unknown> = {
      contact_id: contato!.id,
      conteudo,
      direcao,
    };
    if (evolutionMessageId) payload.evolution_message_id = evolutionMessageId;
    if (mediaInfo) {
      payload.media_type = mediaInfo.type;
      payload.media_mime = mediaMime;
      payload.media_url = mediaUrl;
      payload.media_filename = mediaInfo.filename;
      payload.caption = mediaInfo.caption;
    }

    const { data: inserted, error: insertError } = evolutionMessageId
      ? await supabase
          .from("crm_messages")
          .upsert(payload, { onConflict: "evolution_message_id", ignoreDuplicates: true })
          .select("id")
      : await supabase.from("crm_messages").insert(payload).select("id");

    if (insertError) {
      console.error("[webhook] insert error:", insertError);
    }

    await supabase
      .from("crm_contacts")
      .update({ ultimo_contato: new Date().toISOString() })
      .eq("id", contato!.id);

    // Dispara a resposta automática por IA sem bloquear o retorno do webhook.
    // Só quando a mensagem é realmente nova (não duplicada) e veio do cliente.
    // Usa EdgeRuntime.waitUntil para garantir que a chamada continue rodando
    // mesmo depois da resposta ao webhook já ter sido enviada.
    const isNewMessage = !insertError && Array.isArray(inserted) && inserted.length > 0;
    if (isNewMessage && direcao === "recebida") {
      const aiTask = supabase.functions
        .invoke("crm-ai-respond", { body: { contact_id: contato!.id } })
        .catch((e) => console.error("[webhook] crm-ai-respond erro:", e));
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(aiTask);
      else await aiTask;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro no webhook:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});