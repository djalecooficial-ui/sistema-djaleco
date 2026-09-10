import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { text, products } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurada");

    // Limita o catálogo enviado pra IA pra não estourar o prompt.
    const catalogo = (Array.isArray(products) ? products : []).slice(0, 300).map((p: any) => ({
      id: p.id,
      nome: p.name,
      cores: p.colors,
      tamanhos: p.sizes,
    }));

    const systemPrompt = `Você extrai dados estruturados de um texto colado de pedido recebido por WhatsApp, pra uma loja de jalecos/scrubs (D.Jaleco).

O texto pode ter campos rotulados (NOME, TEL, EMAIL, ENDEREÇO, CEP, CNPJ etc.) seguidos de uma descrição livre do(s) produto(s) pedido(s), nem sempre estruturada — às vezes sem "1x", tamanho e cor em linhas separadas, com detalhes de personalização (bordado, texto, posição) misturados.

Catálogo de produtos disponíveis. Tente casar cada item pedido com um produto_id real (considere variações de escrita, plural/singular, acentos). Se não tiver confiança razoável, deixe produto_id null mas ainda assim preencha produto_nome com a melhor descrição do que foi pedido:
${JSON.stringify(catalogo)}

Responda APENAS com um JSON válido neste formato exato, sem nenhum texto antes ou depois, sem markdown:
{
  "cliente_nome": string ou null,
  "telefones": [string, ...],
  "email": string ou null,
  "profissao": string ou null,
  "endereco": string ou null,
  "numero": string ou null,
  "bairro": string ou null,
  "cidade": string ou null,
  "estado": string ou null,
  "cep": string ou null,
  "documento": string ou null,
  "itens": [
    {
      "produto_id": number ou null,
      "produto_nome": string,
      "quantidade": number,
      "tamanho": string ou null,
      "cor": string ou null,
      "personalizacao": string ou null,
      "confianca": "alta" ou "media" ou "baixa"
    }
  ],
  "observacoes_gerais": string ou null
}

Regras:
- Se não houver quantidade explícita pra um item, use 1.
- "personalizacao" é qualquer detalhe de customização (bordado, texto, posição, gravação, iniciais) que não seja cor nem tamanho do produto em si.
- "confianca" reflete o quanto você tem certeza do produto_id escolhido — "baixa" se ficou em dúvida entre produtos parecidos ou o nome não bate bem com nada do catálogo.
- Se "estado" não vier explícito no texto mas a cidade for inequívoca (ex: São Paulo = SP, Rio de Janeiro = RJ, Belo Horizonte = MG, capitais e grandes cidades conhecidas), preencha o estado (sigla de 2 letras) mesmo assim. Se o nome da cidade for ambíguo entre estados diferentes, deixe null.
- Junte qualquer instrução solta que não caiba nos campos acima em "observacoes_gerais".
- Nunca invente dado que não está no texto (nome, telefone, endereço, produto, etc.) — use null quando não houver informação. A única exceção é o estado inferido pela cidade, conforme a regra acima.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": lovableKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("[parse-pedido-ai] gateway erro", aiResp.status, txt);
      return new Response(JSON.stringify({ error: "Falha na IA", status: aiResp.status, detail: txt }), {
        status: aiResp.status === 429 || aiResp.status === 402 ? aiResp.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ai = await aiResp.json();
    const raw = (ai?.choices?.[0]?.message?.content || "").trim();

    let parsed: unknown;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch (_e) {
      console.error("[parse-pedido-ai] resposta não-JSON da IA:", raw);
      return new Response(JSON.stringify({ error: "IA retornou formato inválido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[parse-pedido-ai] erro:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
