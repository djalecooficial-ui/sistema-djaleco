// Recebe o redirect da autorização do TikTok Shop (app Custom do Partner Center),
// troca o auth_code por access_token/refresh_token e guarda em tiktok_shop_auth.
//
// Secrets necessários (Supabase > Edge Functions > Secrets):
//   TIKTOK_APP_KEY      - App Key do app no Partner Center
//   TIKTOK_APP_SECRET   - App Secret do app (NUNCA commitar nem colar em chat)
//   TIKTOK_AUTH_STATE   - (opcional) valor fixo do parâmetro "state" do link de
//                         autorização; se definido, o callback recusa outro valor
//
// verify_jwt = false em config.toml: quem chama é o navegador do vendedor,
// redirecionado pelo TikTok, sem token do Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";

function page(status: number, title: string, message: string) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;text-align:center}</style>
</head><body><h1>${title}</h1><p>${message}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    const appKey = Deno.env.get("TIKTOK_APP_KEY");
    const appSecret = Deno.env.get("TIKTOK_APP_SECRET");
    if (!appKey || !appSecret) {
      console.error("tiktok-oauth-callback: TIKTOK_APP_KEY/TIKTOK_APP_SECRET ausentes");
      return page(500, "Configuração incompleta", "Credenciais do TikTok não configuradas no servidor.");
    }

    const expectedState = Deno.env.get("TIKTOK_AUTH_STATE");
    if (expectedState && state !== expectedState) {
      return page(400, "Autorização recusada", "Parâmetro de segurança inválido.");
    }
    if (!code) {
      return page(400, "Autorização incompleta", "O TikTok não enviou o código de autorização.");
    }

    const tokenUrl = new URL(TOKEN_URL);
    tokenUrl.searchParams.set("app_key", appKey);
    tokenUrl.searchParams.set("app_secret", appSecret);
    tokenUrl.searchParams.set("auth_code", code);
    tokenUrl.searchParams.set("grant_type", "authorized_code");

    const res = await fetch(tokenUrl.toString(), { method: "GET" });
    const body = await res.json().catch(() => null);

    if (!res.ok || !body || body.code !== 0 || !body.data?.access_token) {
      // Não loga a URL (contém o app_secret) nem tokens; só o código/mensagem.
      console.error("tiktok-oauth-callback: falha na troca do código", res.status, body?.code, body?.message);
      return page(502, "Falha na autorização", "Não foi possível concluir a autorização com o TikTok. Gere um novo link e tente de novo.");
    }

    const d = body.data;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // expire_in vem como timestamp Unix (segundos) de expiração.
    const toIso = (ts: unknown) =>
      typeof ts === "number" && ts > 0 ? new Date(ts * 1000).toISOString() : null;

    const { error } = await supabase.from("tiktok_shop_auth").upsert(
      {
        open_id: d.open_id,
        seller_name: d.seller_name ?? null,
        seller_base_region: d.seller_base_region ?? null,
        user_type: d.user_type ?? null,
        granted_scopes: d.granted_scopes ?? null,
        access_token: d.access_token,
        access_token_expires_at: toIso(d.access_token_expire_in),
        refresh_token: d.refresh_token,
        refresh_token_expires_at: toIso(d.refresh_token_expire_in),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "open_id" },
    );
    if (error) {
      console.error("tiktok-oauth-callback: erro ao salvar", error.message);
      return page(500, "Erro ao salvar", "A autorização foi aceita, mas não foi possível guardá-la. Avise o suporte.");
    }

    return page(200, "Loja conectada", "A loja foi autorizada no TikTok Shop. Você já pode fechar esta janela.");
  } catch (e) {
    console.error("tiktok-oauth-callback: erro inesperado", (e as Error).message);
    return page(500, "Erro inesperado", "Tente novamente em instantes.");
  }
});
