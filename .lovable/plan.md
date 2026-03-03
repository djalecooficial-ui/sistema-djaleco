
# Plano: Kanban Fluido, Dashboard Profissional, Responsividade e Comissoes

## 1. Kanban com Drag-and-Drop Instantaneo

O drag nativo do HTML5 tem limitacoes (sem feedback visual instantaneo, delay). Vamos usar **optimistic updates** com React state local para que o card se mova INSTANTANEAMENTE ao soltar, sem esperar o banco.

**Abordagem**:
- Manter um estado local `pedidosByEtapa` que atualiza imediatamente no `handleDrop`
- O `updatePedido.mutate` roda em background (optimistic)
- Cursor `grab` / `grabbing` ja esta implementado
- Adicionar `touch-action: none` e handlers de touch para mobile
- Scroll horizontal suave com `scroll-snap` e `-webkit-overflow-scrolling: touch`

**Arquivo**: `src/pages/Producao.tsx`

---

## 2. Responsividade Global

Tornar todas as paginas mobile-friendly:

### AppLayout / Sidebar
- Sidebar ja usa componente colapsavel -- verificar comportamento mobile
- No header, garantir que o `SidebarTrigger` funcione como hamburger no mobile

### Pedidos
- Tabela: usar cards empilhados no mobile em vez de tabela horizontal
- Botoes de sync/novo: empilhar verticalmente no mobile
- Search: largura `w-full` no mobile

### Dashboard
- KPI cards: `grid-cols-2` no mobile (2x2) em vez de 4 colunas
- Graficos: altura menor no mobile, labels menores

### Financeiro
- Tabs: scroll horizontal no mobile
- Cards de resumo: `grid-cols-2` no mobile
- Tabelas: scroll horizontal com `overflow-x-auto`

### Producao (Kanban)
- Colunas com scroll horizontal touch-friendly
- Cards com fonte menor no mobile

**Arquivos**: `src/pages/Pedidos.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Financeiro.tsx`, `src/pages/Producao.tsx`, `src/components/layout/AppLayout.tsx`

---

## 3. Taxas Pagarme nos Pedidos (Sync)

Atualizar `nuvemshop-sync` para cruzar com Pagarme:
- Apos importar os pedidos, buscar charges do Pagarme via API
- Cruzar pelo `order_code` (numero do pedido) com `numero_pedido`
- Popular `taxa_pagarme` e recalcular `valor_liquido` em cada pedido

**Arquivo**: `supabase/functions/nuvemshop-sync/index.ts`

---

## 4. Dashboard Profissional com Filtros e Dados Financeiros/Producao

### Filtros
- Seletor de periodo: "Este Mes", "Ultimo Mes", "Ultimos 3 Meses", "Ultimos 6 Meses", "Personalizado"
- Ao mudar, todos os KPIs e graficos atualizam

### KPI Cards (linha superior)
- **Pedidos do Mes** (com variacao % vs mes anterior)
- **Faturamento Bruto**
- **Faturamento Liquido**
- **Ticket Medio**
- **Clientes Novos**

### Secao Financeira (nova)
Cards menores em linha:
- **Taxas Pagarme** (total do periodo)
- **Frete / Correios** (total)
- **Comissoes** (total)
- **Lucro Operacional** (bruto - taxas - frete - comissoes)

### Secao Producao (nova)
- Card com indicadores visuais: "No Prazo" (azul/verde), "Atencao" (laranja), "Atrasado" (vermelho)
- Conta quantos pedidos estao em cada status de prazo usando a mesma logica `getCardColor`
- Grafico horizontal de etapas com cores correspondentes

### Graficos
- Faturamento mensal (bar chart, cor rose)
- Pedidos por origem (pie chart)
- Mini-tabela dos ultimos 5 pedidos

**Arquivos**: `src/hooks/useDashboardStats.ts` (expandir query com dados financeiros e producao), `src/pages/Dashboard.tsx` (reescrever com filtros e novas secoes)

---

## 5. Comissoes no Financeiro -- Marcar como Pago com Data

Na aba "Comissoes":
- Mostrar TODOS os pedidos com comissao (nao so pendentes)
- Coluna "Status" com badge Pago/Pendente
- Coluna "Data Pagamento" editavel (date picker) -- ao marcar como pago, preenche a data
- Botao "Pagar" abre um mini-form com campo de data (default = hoje)
- Pedidos pagos ficam na mesma lista, so muda o status visual
- Campo de comissao editavel inline (click para editar o valor)

**Arquivo**: `src/pages/Financeiro.tsx`

---

## Detalhes Tecnicos

### Kanban Optimistic Update

```text
// Estado local inicializado a partir dos dados do servidor
const [localPedidos, setLocalPedidos] = useState(pedidos)

// No handleDrop:
// 1. Atualiza estado local IMEDIATAMENTE
setLocalPedidos(prev => prev.map(p => 
  p.id === pedidoId ? {...p, etapa_producao: novaEtapa, etapa_entrada_em: now} : p
))
// 2. Salva no banco em background
updatePedido.mutate(...)
```

### Dashboard Stats Expandido

A query `useDashboardStats` passara a aceitar um parametro de periodo e retornara:

```text
{
  totalPedidosMes, faturamentoBruto, faturamentoLiquido, ticketMedio, clientesNovos,
  totalTaxasPagarme, totalFrete, totalComissoes, lucroOperacional,
  producao: { noPrazo: number, atencao: number, atrasado: number },
  revenueByMonth, byOrigin, byEtapa
}
```

### Sync Pagarme nos Pedidos

No `nuvemshop-sync`, apos importar todos os pedidos:

```text
1. Buscar charges do Pagarme (via fetch direto a API, nao via edge function)
2. Para cada charge com order_code, buscar pedido com numero_pedido = order_code
3. Atualizar taxa_pagarme e recalcular valor_liquido e comissao
```

### Ordem de implementacao

1. Kanban com optimistic updates e touch support
2. Responsividade em todas as paginas
3. Dashboard expandido com filtros, financeiro e producao
4. Comissoes com data de pagamento e edicao de valor
5. Sync Pagarme -> taxa nos pedidos
