-- Modo de teste: permite ligar o atendimento 100% automático (IA responde
-- e ENVIA sozinha, sem aprovação humana) só para contatos específicos.
-- Desligado por padrão pra todo mundo — o comportamento padrão continua
-- sendo sempre sugestão + aprovação humana.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS ai_auto_send boolean NOT NULL DEFAULT false;
