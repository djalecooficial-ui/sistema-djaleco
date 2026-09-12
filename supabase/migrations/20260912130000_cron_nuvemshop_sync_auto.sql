-- Sincronização de pedidos com a Nuvemshop deixa de depender só do
-- webhook em tempo real (que às vezes falha ou não é disparado) e do
-- clique manual em "Sincronizar" — roda sozinha a cada 15 min, usando o
-- segredo CRON_SECRET (edge function secret) pra autenticar sem sessão de
-- usuário.
SELECT cron.unschedule('nuvemshop-sync-auto')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nuvemshop-sync-auto');

-- O valor do Authorization abaixo precisa bater com o secret CRON_SECRET
-- configurado nas edge functions (supabase secrets set CRON_SECRET=...).
-- NÃO comitamos o valor real aqui (fica só aplicado direto no banco) —
-- troque <CRON_SECRET_VALUE> pelo valor real só ao rodar manualmente.
SELECT cron.schedule(
  'nuvemshop-sync-auto',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://doaaarwdaayioxjnedpj.supabase.co/functions/v1/nuvemshop-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET_VALUE>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
