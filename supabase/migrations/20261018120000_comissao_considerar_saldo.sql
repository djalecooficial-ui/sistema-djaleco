-- Permite tirar um pedido específico do cálculo do saldo de comissão
-- (ex: pedido cujo repasse do Pagar.me ainda não caiu na conta, mesmo
-- já estando com status_pagamento = 'recebido' do lado do cliente) sem
-- mexer no pedido em si. Default true = continua entrando no cálculo
-- normalmente, como já era antes dessa coluna existir.
ALTER TABLE public.pedidos
ADD COLUMN comissao_considerar_saldo boolean NOT NULL DEFAULT true;
