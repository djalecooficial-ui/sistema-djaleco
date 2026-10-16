-- Controle de comissão deixa de ser por pedido (pago/pendente individual) e
-- passa a ser um saldo corrido: soma de tudo que foi gerado desde a data de
-- corte, menos a soma de lançamentos de pagamento (valores soltos, sem
-- precisar amarrar a um pedido específico) - reflete como a empresa paga de
-- verdade, em lotes que não batem pedido a pedido.
CREATE TABLE public.comissao_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id),
  valor numeric NOT NULL,
  data_pagamento date NOT NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comissao_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select comissao_pagamentos" ON public.comissao_pagamentos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert comissao_pagamentos" ON public.comissao_pagamentos
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update comissao_pagamentos" ON public.comissao_pagamentos
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete comissao_pagamentos" ON public.comissao_pagamentos
  FOR DELETE TO authenticated USING (true);

-- Data de corte: pedidos antes disso não entram no novo saldo (ficam como
-- estão no histórico, sem mexer) - combinado com o usuário, que confirmou
-- que o backlog anterior a isso já foi pago na realidade, só nunca marcado.
INSERT INTO system_settings (key, value, updated_at)
VALUES ('comissao_corte_data', '2026-09-06', now())
ON CONFLICT (key) DO NOTHING;

-- Saldo inicial do controle por lançamentos: os 3 pagamentos que já tinham
-- sido feitos antes dessa tela existir, pra não cobrar de novo.
INSERT INTO comissao_pagamentos (vendedor_id, valor, data_pagamento, observacoes)
SELECT '97f16c11-121d-47d3-9212-ece04cbcb348', v.valor, v.data_pagamento::date, 'Saldo inicial do controle por lançamentos'
FROM (VALUES (500.00, '2026-09-24'), (300.00, '2026-10-13'), (200.00, '2026-10-14')) AS v(valor, data_pagamento)
WHERE NOT EXISTS (SELECT 1 FROM comissao_pagamentos WHERE observacoes = 'Saldo inicial do controle por lançamentos');
