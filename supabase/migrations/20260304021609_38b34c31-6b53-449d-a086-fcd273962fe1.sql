
-- Drop existing public policies on pedidos
DROP POLICY IF EXISTS "Allow public delete on pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Allow public insert on pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Allow public select on pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Allow public update on pedidos" ON public.pedidos;

-- Create authenticated-only policies on pedidos
CREATE POLICY "Authenticated users can select pedidos" ON public.pedidos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert pedidos" ON public.pedidos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update pedidos" ON public.pedidos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete pedidos" ON public.pedidos
  FOR DELETE TO authenticated USING (true);

-- Drop existing public policies on pedido_itens
DROP POLICY IF EXISTS "Allow public delete on pedido_itens" ON public.pedido_itens;
DROP POLICY IF EXISTS "Allow public insert on pedido_itens" ON public.pedido_itens;
DROP POLICY IF EXISTS "Allow public select on pedido_itens" ON public.pedido_itens;

-- Create authenticated-only policies on pedido_itens
CREATE POLICY "Authenticated users can select pedido_itens" ON public.pedido_itens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert pedido_itens" ON public.pedido_itens
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete pedido_itens" ON public.pedido_itens
  FOR DELETE TO authenticated USING (true);
