-- Permite qualquer usuário autenticado gerenciar a base de conhecimento
-- (antes só admin conseguia inserir/editar/apagar, quebrando a tela de CRUD)
CREATE POLICY "Authenticated users can insert crm_knowledge_base"
ON public.crm_knowledge_base
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update crm_knowledge_base"
ON public.crm_knowledge_base
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete crm_knowledge_base"
ON public.crm_knowledge_base
FOR DELETE
TO authenticated
USING (true);
