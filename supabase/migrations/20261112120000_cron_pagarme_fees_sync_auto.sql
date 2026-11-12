-- Sincronização de taxas do Pagar.me deixa de depender só do clique manual
-- em "Taxas Pagarme" — roda sozinha a cada 15 min, defasada em 3 min do
-- sync de pedidos (que roda nos minutos 0/15/30/45), pra sempre atualizar
-- logo depois que um pedido novo entra no sistema. Usa o segredo isolado
-- CRON_SECRET_PAGARME (edge function secret, diferente do CRON_SECRET
-- usado pelas outras automações, pra não arriscar quebrá-las).
SELECT cron.unschedule('pagarme-fees-sync-auto')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pagarme-fees-sync-auto');

-- O valor do Authorization abaixo precisa bater com o secret
-- CRON_SECRET_PAGARME configurado na edge function (supabase secrets set
-- CRON_SECRET_PAGARME=...). NÃO comitamos o valor real aqui (fica só
-- aplicado direto no banco) — troque <CRON_SECRET_PAGARME_VALUE> pelo
-- valor real só ao rodar manualmente.
SELECT cron.schedule(
  'pagarme-fees-sync-auto',
  '3,18,33,48 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://doaaarwdaayioxjnedpj.supabase.co/functions/v1/pagarme-fees-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET_PAGARME_VALUE>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
