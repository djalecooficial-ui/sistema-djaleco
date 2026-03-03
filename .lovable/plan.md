

# Plano: Corrigir formulario WhatsApp + Criar pagina de Produtos

## Problema 1: Formulario WhatsApp nao preenche

O parser `parseWhatsApp` espera labels exatas como `NOME:`, `CELULAR:`, `PEDIDO:`. Se o texto colado do WhatsApp tiver labels diferentes (ex: `Nome completo:`, `Telefone:`, `Itens:`, `Produtos:`), o parser nao reconhece e nao preenche nada.

**Solucao:** Ampliar os matchers do parser para aceitar variacoes comuns:
- `NOME` / `NOME COMPLETO` / `CLIENTE` → `cliente_nome`
- `CELULAR` / `TELEFONE` / `WHATSAPP` / `CONTATO` → `cliente_telefone`
- `PEDIDO` / `ITENS` / `PRODUTOS` / `PRODUTO` → `pedido` (itens)
- Aceitar texto com ou sem acentos

**Arquivo:** `src/pages/NovoPedido.tsx` — funcao `parseWhatsApp`

## Problema 2: Pagina de Produtos da Nuvemshop

### 2a. Edge Function `nuvemshop-products`
Criar nova Edge Function que busca produtos da API Nuvemshop (`GET /products`), agrupa variantes por produto principal, e retorna JSON com:
- `id`, `name`, `images`
- `colors[]` (valores unicos de cor extraidos das variantes)
- `sizes[]` (valores unicos de tamanho extraidos das variantes)

A API da Nuvemshop retorna produtos com `variants[]`, cada variante tem `values[]` (ex: `["P", "Cinza Escuro"]`). A funcao agrupa e deduplica.

### 2b. Pagina `src/pages/Produtos.tsx`
- Lista de produtos em cards com imagem, nome, e dropdowns de cores/tamanhos
- Busca dados via `supabase.functions.invoke("nuvemshop-products")`
- Cada card mostra: imagem principal, nome do produto, badge com qtd variantes
- Dropdowns para ver cores e tamanhos disponiveis

### 2c. Navegacao
- Adicionar item "Produtos" no sidebar (`AppSidebar.tsx`) com icone `Package`
- Adicionar rota `/produtos` no `App.tsx`

### Arquivos
- `supabase/functions/nuvemshop-products/index.ts` — nova edge function
- `src/pages/Produtos.tsx` — nova pagina
- `src/components/layout/AppSidebar.tsx` — adicionar link Produtos
- `src/App.tsx` — adicionar rota
- `src/pages/NovoPedido.tsx` — ampliar parser WhatsApp

