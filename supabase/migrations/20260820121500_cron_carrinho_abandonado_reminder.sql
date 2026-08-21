-- Cron que roda a function nuvemshop-abandoned-cart-reminder a cada 15 min,
-- preparando sugestão de mensagem de recuperação (nunca envia sozinho).
SELECT cron.unschedule('nuvemshop-abandoned-cart-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nuvemshop-abandoned-cart-reminder');

SELECT cron.schedule(
  'nuvemshop-abandoned-cart-reminder',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://doaaarwdaayioxjnedpj.supabase.co/functions/v1/nuvemshop-abandoned-cart-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
