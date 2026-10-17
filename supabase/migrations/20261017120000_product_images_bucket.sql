-- Bucket público usado só como ponte: a foto sobe aqui primeiro pra gente
-- ter uma URL pública, aí a Nuvemshop busca essa URL pra importar a imagem
-- pro produto. Não guardamos metadado nenhum aqui, é transitório.
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload product-images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can update product-images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated users can delete product-images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Public can read product-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');
