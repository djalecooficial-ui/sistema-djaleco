

# Plano: Melhorias no Novo Pedido, Financeiro e Comissoes

## 1. Novo Pedido — Produto com autocomplete da Nuvemshop + Observacoes

**Arquivo:** `src/pages/NovoPedido.tsx`

- Buscar produtos da Edge Function `nuvemshop-products` (ja existente) via react-query
- Campo "Produto" vira um autocomplete/combobox: ao digitar, filtra produtos da Nuvemshop e ao selecionar, popula os dropdowns de tamanho e cor com as opcoes disponiveis daquele produto
- Campos "Tamanho" e "Cor" viram `Select` (dropdown) com as opcoes do produto selecionado
- Layout responsivo para mobile: em telas pequenas, cada item vira um bloco empilhado (vertical) em vez de grid horizontal
- Adicionar campo "Observacoes" (Textarea) no formulario, salvo na tabela `pedidos`

**Migration:** Adicionar coluna `observacoes_pedido` na tabela `pedidos`:
```sql
ALTER TABLE public.pedidos ADD COLUMN observacoes_pedido text;
```

## 2. Financeiro — Filtros na Visao Geral

**Arquivo:** `src/pages/Financeiro.tsx`

Adicionar barra de filtros na aba "Visao Geral" com:
- **Ano** (Select): filtra pedidos por ano
- **Mes** (Select): filtra por mes especifico (opcional, mostra todos se vazio)
- **Periodo personalizado** (date range): dia ou intervalo de datas
- **Vendedor** (Select): filtra por vendedor_id
- **Origem** (Select): "Todos", "Site", "WhatsApp"

Os cards de totais e o grafico de faturamento mensal serao recalculados com base nos filtros aplicados. Os filtros se aplicam sobre `allPedidos` antes de calcular totais.

## 3. Comissoes — Editar percentual + Pagar com data

**Arquivo:** `src/pages/Financeiro.tsx`

- **Editar percentual**: O botao de editar (lapiszinho) passa a editar o **percentual de comissao** em vez do valor absoluto. Ao salvar o novo percentual, o sistema recalcula `comissao = valor_liquido * (percentual / 100)` e salva o novo valor
- **Botao Pagar com data**: O botao "Pagar" no mobile (que hoje marca como "Pagar Hoje" direto) passa a abrir o mesmo Popover com Calendar que ja existe no desktop, permitindo escolher a data de pagamento

### Arquivos afetados
- `src/pages/NovoPedido.tsx` — autocomplete de produtos, dropdowns, observacoes, layout mobile
- `src/pages/Financeiro.tsx` — filtros na visao geral, edicao de percentual, pagar com data no mobile
- Migration SQL — coluna `observacoes_pedido`

