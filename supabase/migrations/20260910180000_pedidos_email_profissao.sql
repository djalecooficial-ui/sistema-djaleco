-- Novo Pedido (colar WhatsApp com IA) já extrai e-mail e profissão do
-- cliente, mas não existia onde guardar isso estruturado — ficava só em
-- observações. Segue o padrão de cliente_nome/cliente_telefone.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cliente_email TEXT,
  ADD COLUMN IF NOT EXISTS cliente_profissao TEXT;
