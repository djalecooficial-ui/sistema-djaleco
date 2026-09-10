-- Permite ao admin liberar/bloquear páginas específicas por usuário, além
-- do papel admin/user já existente. Vendedores e Sistema continuam
-- exclusivos de admin (fora desse controle, tratados no frontend).
-- Sem registro para uma página = acesso liberado por padrão (mesmo
-- comportamento de hoje); o admin restringe criando um registro com
-- allowed = false.
CREATE TABLE public.user_page_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_key)
);

ALTER TABLE public.user_page_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own page access" ON public.user_page_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage page access" ON public.user_page_access
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
