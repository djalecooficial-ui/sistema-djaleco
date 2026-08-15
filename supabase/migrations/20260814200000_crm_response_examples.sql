-- Guarda exemplos reais de pergunta do cliente -> resposta escrita pelo
-- atendente, capturados automaticamente sempre que alguém manda uma
-- mensagem manualmente. Usado pela IA como referência de estilo/tom.
CREATE TABLE public.crm_response_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
    pergunta_cliente TEXT NOT NULL,
    resposta_humana TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_response_examples TO authenticated;
GRANT ALL ON public.crm_response_examples TO service_role;

ALTER TABLE public.crm_response_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crm_response_examples"
ON public.crm_response_examples FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert crm_response_examples"
ON public.crm_response_examples FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete crm_response_examples"
ON public.crm_response_examples FOR DELETE TO authenticated USING (true);
