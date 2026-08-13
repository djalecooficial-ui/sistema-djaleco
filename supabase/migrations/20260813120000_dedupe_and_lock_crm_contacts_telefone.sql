-- Mescla contato duplicado (mesmo telefone criado por condição de corrida no webhook)
UPDATE public.crm_messages
   SET contact_id = '0290a9e2-23f4-4b09-9ee4-24d01e6ac3e2'
 WHERE contact_id = '1f5f2be7-81d2-49e1-acd3-4b84c0f33c4b';

UPDATE public.crm_contacts c
   SET last_message_at = m.last_at,
       last_message_preview = LEFT(m.last_content, 120),
       unread_count = 2
  FROM (
    SELECT contact_id, created_at AS last_at, conteudo AS last_content
    FROM public.crm_messages
    WHERE contact_id = '0290a9e2-23f4-4b09-9ee4-24d01e6ac3e2'
    ORDER BY created_at DESC
    LIMIT 1
  ) m
 WHERE c.id = '0290a9e2-23f4-4b09-9ee4-24d01e6ac3e2';

DELETE FROM public.crm_contacts WHERE id = '1f5f2be7-81d2-49e1-acd3-4b84c0f33c4b';

-- Impede duplicidade futura: um único contato por telefone
ALTER TABLE public.crm_contacts
  ADD CONSTRAINT crm_contacts_telefone_key UNIQUE (telefone);
