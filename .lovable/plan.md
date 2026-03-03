

# Plano: Comissoes por canal, exclusao de pedido e explicacao SuperFrete

## 1. Vendedores — Comissoes independentes por canal (WhatsApp e Site)

**Migration:** Adicionar colunas na tabela `vendedores`:
```sql
ALTER TABLE public.vendedores 
  ADD COLUMN taxa_comissao_site numeric NOT NULL DEFAULT 10.00,
  ADD COLUMN taxa_comissao_whatsapp numeric NOT NULL DEFAULT 10.00;
```
A coluna `taxa_comissao` existente sera mantida como fallback/legado.

**`src/pages/Vendedores.tsx`:**
- Na tabela, trocar coluna unica "Comissao" por duas: "Comissao Site" e "Comissao WhatsApp"
- No formulario de criar/editar, dois campos separados: "Comissao Site (%)" e "Comissao WhatsApp (%)"

**`src/hooks/useVendedores.ts`:** Nenhuma mudanca necessaria (ja usa generic insert/update).

**`src/pages/PedidoDetalhe.tsx` e `src/pages/NovoPedido.tsx`:**
- Ao calcular comissao, usar `taxa_comissao_site` ou `taxa_comissao_whatsapp` conforme a `origem` do pedido ("site" ou "whatsapp")

**`src/integrations/supabase/types.ts`:** Atualizar tipos para incluir as novas colunas.

## 2. Botao de exclusao de pedido

**`src/pages/PedidoDetalhe.tsx`:**
- Adicionar botao "Excluir Pedido" (vermelho, com icone Trash2) no header do pedido
- Ao clicar, abrir AlertDialog perguntando "Tem certeza que deseja excluir este pedido?"
- Se confirmar, deleta o pedido via Supabase e redireciona para `/pedidos`

**`src/hooks/usePedidos.ts`:** Adicionar hook `useDeletePedido` (mutation que deleta da tabela `pedidos`).

## 3. SuperFrete — como funciona

Sobre a pergunta do usuario, responderei diretamente no chat:

- **Rastreio e entrega:** A Edge Function `superfrete-tracking` ja esta implementada. Quando um pedido tem `rastreio_codigo` ou `superfrete_order_id`, o botao "Consultar SuperFrete" chama a API do SuperFrete, busca o status de rastreio e, se entregue, atualiza `data_entrega` e etapa para "Entregue" automaticamente.
- **Calculo de frete:** A API do SuperFrete permite calcular o valor do frete informando CEP de origem, CEP de destino, peso e dimensoes do pacote. Porem, para isso funcionar no formulario de novo pedido, seria necessario cadastrar peso/dimensoes dos produtos — que nao temos hoje. Por enquanto o frete permanece manual. Se o usuario quiser, podemos adicionar campos de peso/dimensao nos produtos futuramente.

## Arquivos afetados
- Migration SQL — novas colunas `taxa_comissao_site` e `taxa_comissao_whatsapp` em `vendedores`
- `src/integrations/supabase/types.ts` — atualizar tipos
- `src/pages/Vendedores.tsx` — formulario e tabela com comissoes por canal
- `src/pages/PedidoDetalhe.tsx` — botao excluir pedido, usar comissao por canal
- `src/pages/NovoPedido.tsx` — usar comissao por canal ao salvar
- `src/hooks/usePedidos.ts` — adicionar `useDeletePedido`

