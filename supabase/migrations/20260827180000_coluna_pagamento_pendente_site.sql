-- Nova coluna "Pagamento Pendente" no quadro Site, separando esses contatos
-- dos que já têm pagamento confirmado (antes ambos ficavam misturados em
-- "Aguardando Envio").
UPDATE crm_board_columns
SET ordem = ordem + 1
WHERE board = 'site' AND key != 'carrinho_abandonado';

INSERT INTO crm_board_columns (board, key, label, cor, ordem)
VALUES ('site', 'pagamento_pendente', 'Pagamento Pendente', 'yellow', 1);

-- Corrige os contatos que já estavam com sugestão de pagamento pendente
-- gerada antes dessa coluna existir.
UPDATE crm_contacts
SET status = 'pagamento_pendente'
WHERE tags::text ~ 'Pagamento Pendente #(636|628|633)'
  AND status = 'aguardando_envio';
