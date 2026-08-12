-- Base de conhecimento da empresa, usada pela IA para responder no WhatsApp
CREATE TABLE public.crm_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    categoria TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_knowledge_base TO authenticated;
GRANT ALL ON public.crm_knowledge_base TO service_role;

ALTER TABLE public.crm_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crm_knowledge_base"
ON public.crm_knowledge_base
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins have full access to crm_knowledge_base"
ON public.crm_knowledge_base
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_crm_knowledge_base_updated_at
BEFORE UPDATE ON public.crm_knowledge_base
FOR EACH ROW EXECUTE FUNCTION public.update_crm_contacts_updated_at();

-- Interruptor de automação por contato + marcação de mensagens geradas por IA
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.crm_messages
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean NOT NULL DEFAULT false;
