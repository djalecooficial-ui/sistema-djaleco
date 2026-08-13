-- Biblioteca de anexos reutilizáveis (fotos, PDFs, tabelas) para enviar no WhatsApp
CREATE TABLE public.crm_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    categoria TEXT,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_mime TEXT NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_attachments TO authenticated;
GRANT ALL ON public.crm_attachments TO service_role;

ALTER TABLE public.crm_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crm_attachments"
ON public.crm_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert crm_attachments"
ON public.crm_attachments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update crm_attachments"
ON public.crm_attachments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete crm_attachments"
ON public.crm_attachments FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_crm_attachments_updated_at
BEFORE UPDATE ON public.crm_attachments
FOR EACH ROW EXECUTE FUNCTION public.update_crm_contacts_updated_at();

-- Bucket de storage público para os arquivos da biblioteca
INSERT INTO storage.buckets (id, name, public)
VALUES ('crm-attachments', 'crm-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload crm-attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'crm-attachments');

CREATE POLICY "Authenticated users can update crm-attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'crm-attachments');

CREATE POLICY "Authenticated users can delete crm-attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'crm-attachments');

CREATE POLICY "Public can read crm-attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'crm-attachments');
