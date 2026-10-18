-- As etiquetas de envio são geradas direto no site da SuperFrete (não pela
-- Nuvemshop), então o pedido na Nuvemshop nunca recebe o código de rastreio
-- de volta - por isso nada chegava até aqui. A função superfrete-tracking
-- agora também busca os envios direto na API da SuperFrete (GET
-- /api/v0/me/orders) e casa com os pedidos pelo nome do destinatário +
-- proximidade de data, pros que ainda não têm nenhum rastreio vinculado.
-- Esse job roda sozinho a cada 2h, usando o mesmo CRON_SECRET do
-- nuvemshop-sync-auto pra autenticar sem sessão de usuário.
SELECT cron.unschedule('superfrete-tracking-auto')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'superfrete-tracking-auto');

-- O valor do Authorization abaixo precisa bater com o secret CRON_SECRET
-- configurado nas edge functions. NÃO comitamos o valor real aqui (fica só
-- aplicado direto no banco) — troque <CRON_SECRET_VALUE> pelo valor real
-- só ao rodar manualmente.
SELECT cron.schedule(
  'superfrete-tracking-auto',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://doaaarwdaayioxjnedpj.supabase.co/functions/v1/superfrete-tracking',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET_VALUE>"}'::jsonb,
    body := '{"batch": true}'::jsonb
  );
  $$
);
