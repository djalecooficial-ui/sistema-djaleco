-- Tokens de autorização da loja Djaleco no TikTok Shop (Partner Center, app Custom).
-- Preenchida pela edge function tiktok-oauth-callback.
--
-- RLS ligada e SEM policies de propósito: só a service role (edge functions)
-- lê/escreve. Os tokens nunca devem ser expostos ao navegador.
CREATE TABLE IF NOT EXISTS public.tiktok_shop_auth (
  open_id text PRIMARY KEY,
  seller_name text,
  seller_base_region text,
  user_type integer,
  granted_scopes text[],
  access_token text NOT NULL,
  access_token_expires_at timestamptz,
  refresh_token text NOT NULL,
  refresh_token_expires_at timestamptz,
  -- Preenchidos depois, pela chamada "Get Authorized Shops" da API.
  shop_id text,
  shop_cipher text,
  shop_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tiktok_shop_auth ENABLE ROW LEVEL SECURITY;
