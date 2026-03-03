
# Plano: App de Gestao Djaleco

Sistema completo de gestao para e-commerce de jalecos e scrubs, com 4 modulos principais conectados ao banco de dados Supabase ja existente (164 clientes, 8 pedidos, 2 vendedores).

---

## Estrutura do App

### Layout Principal
- **Sidebar** fixa a esquerda com navegacao entre modulos
- **Header** com nome "Djaleco" e informacoes contextuais
- Design moderno com tema claro, cores profissionais (branco/azul/cinza)

### Paginas e Rotas

| Rota | Pagina | Descricao |
|------|--------|-----------|
| `/` | Dashboard | Visao geral com KPIs e graficos |
| `/pedidos` | Pedidos | Lista e gestao de pedidos |
| `/pedidos/:id` | Detalhe Pedido | Visualizar/editar pedido individual |
| `/producao` | Producao | Kanban das etapas de producao |
| `/clientes` | Clientes | CRM com lista e filtros |
| `/clientes/:id` | Detalhe Cliente | Ficha completa do cliente |
| `/financeiro` | Financeiro | Resumo financeiro e comissoes |
| `/vendedores` | Vendedores | Gestao de vendedores |

---

## Modulo 1: Dashboard (Pagina Inicial)

Cards de KPIs:
- Total de pedidos (mes atual)
- Faturamento bruto do mes
- Ticket medio
- Clientes novos no mes

Graficos (usando Recharts, ja instalado):
- Faturamento dos ultimos 6 meses (barra)
- Pedidos por origem (pizza: site vs whatsapp)
- Status da producao (barra horizontal)

Lista dos ultimos 5 pedidos com acesso rapido.

---

## Modulo 2: Gestao de Vendas (Pedidos)

**Lista de Pedidos:**
- Tabela com colunas: numero, cliente, valor bruto, origem, etapa producao, data
- Filtros por: origem, etapa de producao, periodo
- Busca por nome do cliente ou numero do pedido
- Botao para criar novo pedido

**Formulario de Pedido (criar/editar):**
- Dados do cliente (nome, telefone, cidade, estado)
- Itens do pedido (tabela editavel com produto, quantidade, cor, tamanho)
- Valores: bruto, frete, taxa pagarme, comissao, liquido
- Vendedor (select dos vendedores ativos)
- Origem (site/whatsapp)
- Rastreio e datas

---

## Modulo 3: Producao (Kanban)

Quadro Kanban com colunas baseadas nas etapas existentes:
- **Novo** - Pedidos recem-criados
- **Planejamento** - Em fase de planejamento
- **Corte** - Material em corte

Cada card mostra: numero do pedido, cliente, itens resumidos, tempo na etapa.
Arrastar e soltar (drag-and-drop) para mover entre etapas.
Ao mover, atualiza `etapa_producao` e `etapa_entrada_em` no banco.

---

## Modulo 4: CRM de Clientes

**Lista de Clientes:**
- Tabela com: nome, telefone, email, cidade/estado, total pedidos, total gasto, tags
- Filtros por tags, cidade, estado
- Busca por nome, email ou telefone
- Ordenacao por total gasto, total pedidos, ultima compra

**Ficha do Cliente:**
- Dados cadastrais editaveis
- Historico de pedidos vinculados (busca por nome do cliente nos pedidos)
- Tags editaveis
- Campo de observacoes
- Metricas: total gasto, total pedidos, primeira/ultima compra

---

## Modulo 5: Financeiro

**Visao Geral:**
- Cards: faturamento bruto, liquido, total frete, total taxas, total comissoes
- Filtros por periodo (mes/semana/customizado)
- Grafico de faturamento por periodo

**Comissoes dos Vendedores:**
- Lista de pedidos com comissao pendente/paga
- Marcar comissao como paga (atualiza `comissao_paga` e `comissao_paga_em`)
- Resumo por vendedor

**Gestao de Vendedores:**
- CRUD completo de vendedores (nome, telefone, email, taxa comissao, status)

---

## Detalhes Tecnicos

### Arquivos a criar

```text
src/
  components/
    layout/
      AppSidebar.tsx        -- Sidebar de navegacao
      AppLayout.tsx          -- Layout com sidebar + content
    dashboard/
      KpiCards.tsx           -- Cards de metricas
      RevenueChart.tsx       -- Grafico de faturamento
      OrdersByOrigin.tsx     -- Grafico pizza
      ProductionStatus.tsx   -- Status da producao
      RecentOrders.tsx       -- Ultimos pedidos
    pedidos/
      PedidosList.tsx        -- Tabela de pedidos
      PedidoForm.tsx         -- Formulario criar/editar
      PedidoDetail.tsx       -- Detalhe do pedido
    producao/
      KanbanBoard.tsx        -- Quadro kanban
      KanbanColumn.tsx       -- Coluna do kanban
      KanbanCard.tsx         -- Card de pedido
    clientes/
      ClientesList.tsx       -- Tabela de clientes
      ClienteDetail.tsx      -- Ficha do cliente
      ClienteForm.tsx        -- Formulario de edicao
    financeiro/
      FinanceiroOverview.tsx -- Resumo financeiro
      ComissoesTable.tsx     -- Tabela de comissoes
    vendedores/
      VendedoresList.tsx     -- CRUD de vendedores
      VendedorForm.tsx       -- Formulario de vendedor
  hooks/
    usePedidos.ts            -- Queries/mutations de pedidos
    useClientes.ts           -- Queries/mutations de clientes
    useVendedores.ts         -- Queries/mutations de vendedores
    useDashboardStats.ts     -- Queries de metricas
  pages/
    Dashboard.tsx
    Pedidos.tsx
    PedidoDetalhe.tsx
    Producao.tsx
    Clientes.tsx
    ClienteDetalhe.tsx
    Financeiro.tsx
    Vendedores.tsx
```

### Stack utilizada
- **React + TypeScript** com Vite
- **Tailwind CSS** + shadcn/ui (componentes ja instalados)
- **React Router** para navegacao
- **TanStack React Query** para data fetching
- **Recharts** para graficos
- **Supabase JS** para conexao com banco

### Banco de dados
Nao sera necessaria nenhuma migracao inicial -- todas as tabelas ja existem com a estrutura adequada. Os dados serao consumidos diretamente das tabelas `pedidos`, `pedido_itens`, `clientes` e `vendedores`.

### Observacao sobre autenticacao
As tabelas atualmente tem politicas RLS publicas (permitem acesso sem autenticacao). O app funcionara sem login inicialmente, mas e recomendavel implementar autenticacao no futuro para proteger os dados.

---

## Ordem de implementacao

1. Layout (Sidebar + AppLayout)
2. Dashboard com KPIs e graficos
3. Modulo de Pedidos (lista + formulario + detalhe)
4. Modulo de Producao (Kanban)
5. Modulo de Clientes (CRM)
6. Modulo Financeiro + Vendedores

Cada etapa sera implementada de forma incremental para facilitar a revisao.
