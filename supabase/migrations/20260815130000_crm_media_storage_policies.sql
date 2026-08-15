-- O bucket crm-media nunca teve política de RLS para upload direto do
-- navegador (só o service role, dentro das edge functions, conseguia
-- escrever). Isso bloqueava upload de imagem colada e de áudio gravado
-- direto pela tela da conversa.
CREATE POLICY "Authenticated users can upload crm-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'crm-media');

CREATE POLICY "Authenticated users can update crm-media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'crm-media');

CREATE POLICY "Authenticated users can delete crm-media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'crm-media');
