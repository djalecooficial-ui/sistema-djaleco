-- Lembrete automático (uma vez, após 2h, limitado a pedidos de até 48h) para
-- pedidos com pagamento pendente.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS lembrete_pagamento_enviado_at TIMESTAMPTZ;

-- Marca o histórico existente como já tratado, para a automação valer só
-- daqui pra frente (não manda lembrete de pedidos antigos/já abandonados).
UPDATE public.pedidos
   SET lembrete_pagamento_enviado_at = now()
 WHERE status_pagamento = 'pendente'
   AND lembrete_pagamento_enviado_at IS NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('nuvemshop-payment-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nuvemshop-payment-reminder');

SELECT cron.schedule(
  'nuvemshop-payment-reminder',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://doaaarwdaayioxjnedpj.supabase.co/functions/v1/nuvemshop-payment-reminder',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
