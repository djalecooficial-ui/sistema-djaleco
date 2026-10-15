-- Quando a Sofia escala uma conversa (pergunta fora da base de conhecimento,
-- reclamação, pedido específico), passa a avisar a equipe por WhatsApp em
-- vez de só mudar o status no Kanban. O número de destino é lido da chave
-- "staff_notificacao_telefone" em system_settings.
--
-- O valor real (telefone de um funcionário) não fica commitado aqui por
-- privacidade — foi configurado direto no banco. Pra trocar o número:
--
-- UPDATE system_settings SET value = '55DDDNNNNNNNNN', updated_at = now()
-- WHERE key = 'staff_notificacao_telefone';
INSERT INTO system_settings (key, value, updated_at)
VALUES ('staff_notificacao_telefone', NULL, now())
ON CONFLICT (key) DO NOTHING;
