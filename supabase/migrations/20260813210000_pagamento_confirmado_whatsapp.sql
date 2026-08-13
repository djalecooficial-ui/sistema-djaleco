-- Marca no contato do CRM quando um pagamento foi confirmado, pra destacar
-- visualmente ("acabou de pagar") e permitir mensagem automática de boas-vindas.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS pedido_confirmado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pedido_numero TEXT,
  ADD COLUMN IF NOT EXISTS pedido_valor NUMERIC;
