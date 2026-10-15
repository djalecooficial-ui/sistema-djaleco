-- Permite que a Sofia inclua um anexo da Biblioteca (ex: catálogo) junto
-- com a sugestão de texto, quando o cliente pede foto/catálogo/tabela.
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS ai_suggestion_anexo_id uuid REFERENCES public.crm_attachments(id) ON DELETE SET NULL;
