-- Suporte ao modo "sugestão" da IA: em vez de enviar automaticamente,
-- a IA prepara uma sugestão de resposta para o atendente revisar e enviar.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS ai_suggestion JSONB,
  ADD COLUMN IF NOT EXISTS ai_suggestion_at TIMESTAMPTZ;
