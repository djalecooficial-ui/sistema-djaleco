ALTER TABLE public.vendedores 
  ADD COLUMN taxa_comissao_site numeric NOT NULL DEFAULT 10.00,
  ADD COLUMN taxa_comissao_whatsapp numeric NOT NULL DEFAULT 10.00;