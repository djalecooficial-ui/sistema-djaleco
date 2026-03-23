
ALTER TABLE public.pedidos 
  ADD COLUMN taxa_ted numeric NOT NULL DEFAULT 0,
  ADD COLUMN ted_confirmado boolean NOT NULL DEFAULT false;

-- Set taxa_ted = 3.67 for pedido #533 and onwards (orders with numero_pedido >= 533 from site)
UPDATE public.pedidos 
SET taxa_ted = 3.67, ted_confirmado = false
WHERE CAST(REGEXP_REPLACE(numero_pedido, '[^0-9]', '', 'g') AS integer) >= 533
  AND origem = 'site'
  AND taxa_ted = 0;
