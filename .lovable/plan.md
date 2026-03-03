

# Plano: Corrigir Sync para Popular Taxas Pagarme

## Problema Identificado

O edge function `nuvemshop-sync` processa 423 pedidos sequencialmente (cada pedido faz ~5 queries ao Supabase), causando timeout antes de chegar a parte que cruza com o Pagarme (linhas 177-257). Por isso, nenhum pedido tem `taxa_pagarme` preenchida.

## Solucao

Separar a logica de cruzamento Pagarme em uma **edge function independente** chamada `pagarme-fees-sync`. Isso permite:
1. Executar o cruzamento Pagarme separadamente, sem depender do sync completo da Nuvemshop
2. A funcao e rapida: busca charges do Pagarme, busca pedidos com `taxa_pagarme = 0`, e atualiza

### Nova Edge Function: `pagarme-fees-sync`

Logica:
1. Buscar charges do Pagarme API v5 (ultimos 3 meses, paginado)
2. Montar mapa `order_code -> fee` (amount - paid_amount)
3. Buscar pedidos com `taxa_pagarme = 0` no Supabase
4. Para cada match, atualizar `taxa_pagarme`, recalcular `valor_liquido` e `comissao`
5. Retornar contagem de atualizacoes

### Otimizar `nuvemshop-sync`

Remover a secao de Pagarme do sync (linhas 177-257) para reduzir tempo de execucao. O sync foca apenas em importar pedidos da Nuvemshop.

Adicionalmente, nao sobrescrever `etapa_producao` e `etapa_entrada_em` em pedidos ja existentes (para nao resetar o que o usuario moveu no Kanban).

## Arquivos

### Criar
- `supabase/functions/pagarme-fees-sync/index.ts` -- funcao dedicada ao cruzamento de taxas

### Editar
- `supabase/functions/nuvemshop-sync/index.ts` -- remover secao Pagarme (ja tera funcao propria), preservar etapa em updates
- `supabase/config.toml` -- registrar `pagarme-fees-sync` com `verify_jwt = false`
- `src/pages/Pedidos.tsx` -- adicionar botao "Sync Taxas Pagarme" para chamar a nova funcao

## Detalhes Tecnicos

### pagarme-fees-sync (logica principal)

```text
1. Auth: Basic base64(PAGARME_API_KEY + ":")
2. GET https://api.pagar.me/core/v5/charges?page=X&size=100&created_since=3meses
3. Map: orderCode -> { fee: amount/100 - paid_amount/100 }
4. SELECT pedidos WHERE taxa_pagarme = 0
5. Para cada pedido com match:
   - taxa_pagarme = fee
   - valor_liquido = valor_bruto - frete - taxa_pagarme
   - comissao = (valor_bruto - taxa_pagarme - frete) * taxa_vendedor / 100
   - UPDATE pedido
```

### Preservar etapa no sync Nuvemshop

No update de pedidos existentes, excluir `etapa_producao` e `etapa_entrada_em` do payload para nao resetar o que foi movido manualmente.

### Ordem de execucao

1. Criar `pagarme-fees-sync`
2. Limpar `nuvemshop-sync` (remover bloco Pagarme, preservar etapas)
3. Registrar em `config.toml`
4. Deploy e executar
5. Verificar se `taxa_pagarme` foi populada nos pedidos
