-- Colunas configuráveis por quadro (site / whatsapp), para separar o
-- pós-venda de compradores do site do funil de vendas do WhatsApp.
CREATE TABLE public.crm_board_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board TEXT NOT NULL CHECK (board IN ('whatsapp', 'site')),
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    cor TEXT NOT NULL DEFAULT 'slate',
    ordem INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (board, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_board_columns TO authenticated;
GRANT ALL ON public.crm_board_columns TO service_role;

ALTER TABLE public.crm_board_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view crm_board_columns"
ON public.crm_board_columns FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert crm_board_columns"
ON public.crm_board_columns FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update crm_board_columns"
ON public.crm_board_columns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete crm_board_columns"
ON public.crm_board_columns FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_crm_board_columns_updated_at
BEFORE UPDATE ON public.crm_board_columns
FOR EACH ROW EXECUTE FUNCTION public.update_crm_contacts_updated_at();

-- Colunas padrão do quadro de vendas via WhatsApp
INSERT INTO public.crm_board_columns (board, key, label, cor, ordem) VALUES
('whatsapp', 'novo', 'Novo', 'blue', 0),
('whatsapp', 'em_atendimento', 'Em Atendimento', 'yellow', 1),
('whatsapp', 'aguardando_cliente', 'Aguardando Cliente', 'purple', 2),
('whatsapp', 'vendido', 'Vendido', 'green', 3),
('whatsapp', 'nao_vendido', 'Não Vendido', 'red', 4);

-- Colunas padrão do quadro de pedidos do site
INSERT INTO public.crm_board_columns (board, key, label, cor, ordem) VALUES
('site', 'aguardando_envio', 'Aguardando Envio', 'blue', 0),
('site', 'confirmacao_enviada', 'Confirmação Enviada', 'slate', 1),
('site', 'cliente_respondeu', 'Cliente Respondeu', 'purple', 2),
('site', 'encerrado', 'Encerrado', 'green', 3);

-- Migra os contatos existentes para as novas chaves de coluna
UPDATE public.crm_contacts SET status = 'aguardando_cliente'
 WHERE origem = 'whatsapp' AND status = 'aguardando';

UPDATE public.crm_contacts SET status = 'aguardando_envio'
 WHERE origem = 'site' AND status = 'novo';
