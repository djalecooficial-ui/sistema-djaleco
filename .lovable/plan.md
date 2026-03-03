

# Plano: Corrigir parsing de itens, numeracao ZAP e filtro de abas

## Problemas

1. **Parsing de itens do WhatsApp cria uma linha por caracteristica** — o split por `,` quebra "Scrub Antonia (Cinza Escuro) M (42)), Scrub Antonia (Vinho) M (42))" incorretamente porque parenteses e virgulas se misturam. Precisa de um parser mais inteligente que entenda que cada item eh `NxProduto (Cor) Tamanho` como uma unidade.

2. **Numeracao deve ser ZAP, nao WP** — `getNextWPNumber` busca `%-WP` e gera `001-WP`. Trocar para `%-ZAP` e gerar `001-ZAP`.

3. **Aba Recebidos mostrando pedidos nao pagos** — a logica `isPago` considera pago qualquer pedido com `valor_bruto > 0` e etapa diferente de "Novo"/"Cancelado". Pedidos WhatsApp manuais com etapa "Planejamento" caem como "pagos". Precisa ajustar: pedido so eh "recebido" se `taxa_pagarme > 0` OU se `origem === "whatsapp"` com confirmacao de pagamento (ou outra regra clara).

## Alteracoes

### 1. `src/hooks/usePedidos.ts` — renomear para ZAP
- `getNextWPNumber` -> `getNextZAPNumber`
- Buscar `%-ZAP` e gerar formato `001-ZAP`

### 2. `src/pages/NovoPedido.tsx` — corrigir parsing de itens
- Melhorar `parseItens`: em vez de split por `,`, usar regex que identifica o padrao `Nx Produto` como delimitador de cada item
- Cada item no formato WhatsApp eh tipicamente: `1x Scrub Antônia (Cinza Escuro) M (42)`
- O parser deve capturar `quantidade`, `nome_produto` (incluindo cor e tamanho no nome), e opcionalmente extrair cor e tamanho dos parenteses
- Atualizar chamada de `getNextWPNumber` para `getNextZAPNumber`

### 3. `src/pages/Pedidos.tsx` — ajustar filtro isPago
- Tornar mais restritivo: `isPago` retorna true somente se `taxa_pagarme > 0` (confirmacao real de pagamento via gateway). Pedidos manuais (whatsapp) sem taxa ficam em Pendentes ate serem marcados manualmente.

### Arquivos
- `src/hooks/usePedidos.ts` — renomear funcao e pattern ZAP
- `src/pages/NovoPedido.tsx` — melhorar parser de itens + usar getNextZAPNumber
- `src/pages/Pedidos.tsx` — ajustar isPago

