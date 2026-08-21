-- Nova coluna "Carrinho Abandonado" no quadro Site, pra receber os
-- contatos que a function nuvemshop-abandoned-cart-reminder cria/atualiza
-- quando um checkout fica 3h+ sem finalizar.
UPDATE crm_board_columns
SET ordem = ordem + 1
WHERE board = 'site';

INSERT INTO crm_board_columns (board, key, label, cor, ordem)
VALUES ('site', 'carrinho_abandonado', 'Carrinho Abandonado', 'orange', 0);
