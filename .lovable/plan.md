

## Diagnóstico e Plano de Ação

### Problemas Identificados

**1. Taxas Pagar.me (problema principal)**
Executei o sync agora e ele atualizou apenas **21 de 423 pedidos**. O motivo: a API do Pagar.me retornou apenas **30 charges** nos últimos 6 meses. Os pedidos mais antigos (desde 2022) não têm correspondência na API. Isso pode significar:
- O Pagar.me só retém dados recentes na API de charges
- A janela de 6 meses é insuficiente (precisa ampliar)

Além disso, o sync usa `taxa_comissao` genérica, mas a tabela tem `taxa_comissao_site` e `taxa_comissao_whatsapp`. O cálculo deveria usar a taxa correta conforme a `origem` do pedido.

**2. Comissões**
Após o sync de agora, os valores de William Nogueira mudaram (R$24.196,93 total / R$24.127,54 pendente) porque 21 pedidos tiveram a comissão recalculada com as taxas do Pagar.me. Porém, os ~400 pedidos restantes ainda usam comissão calculada sem taxa (taxa_pagarme = 0), inflando o valor.

**3. Gráficos do Dashboard**
Concordo que os gráficos de pizza e barras estão simples demais. O usuário quer removê-los ou substituí-los.

---

### Plano de Implementação

#### 1. Redesign do Dashboard
- **Remover** os 4 gráficos (Faturamento Mensal, Pedidos por Origem, Etapas da Produção, Últimos Pedidos pie chart)
- **Manter** apenas os KPI boxes (Pedidos, Fat. Bruto, Fat. Líquido, Ticket Médio, Clientes Novos) + Financeiro boxes + Produção boxes
- **Manter** a seção "Últimos Pedidos" como lista (sem gráfico)
- **Trocar o filtro** de 4 presets para: seletor de **Ano + Mês** (como no Financeiro) e modo **Personalizado** com date range

#### 2. Corrigir Sync Pagar.me
- **Ampliar janela** de 6 meses para **24 meses** para cobrir mais pedidos
- **Corrigir cálculo de comissão** no sync: usar `taxa_comissao_site` ou `taxa_comissao_whatsapp` conforme `pedido.origem`
- Adicionar o campo `origem` na query de pedidos do sync

#### 3. Recalcular Comissões
- Após o sync atualizar as taxas, a comissão é recalculada automaticamente. Os valores no Financeiro vão refletir os números corretos assim que mais pedidos tiverem a `taxa_pagarme` preenchida.

### Arquivos a Modificar
- `src/pages/Dashboard.tsx` - Remover gráficos, novo filtro por mês
- `src/hooks/useDashboardStats.ts` - Adaptar query ao novo formato de filtro (ano+mês+custom)
- `supabase/functions/pagarme-fees-sync/index.ts` - Ampliar janela, corrigir taxa por origem

