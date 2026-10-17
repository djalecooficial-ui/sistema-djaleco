import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VariantInput {
  valores: string[];
  preco: string;
  estoque: number;
  sku?: string;
}

interface CreateProductInput {
  nome: string;
  descricao?: string;
  categorias?: number[];
  atributos: string[];
  variantes: VariantInput[];
  imagens?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const storeId = Deno.env.get("NUVEMSHOP_STORE_ID");
    const accessToken = Deno.env.get("NUVEMSHOP_ACCESS_TOKEN");
    if (!storeId || !accessToken) {
      throw new Error("Missing Nuvemshop credentials");
    }

    const baseUrl = `https://api.nuvemshop.com.br/v1/${storeId}`;
    const headers = {
      Authentication: `bearer ${accessToken}`,
      "User-Agent": "Djaleco App (contato@djaleco.com.br)",
      "Content-Type": "application/json",
    };

    const input: CreateProductInput = await req.json();
    if (!input.nome?.trim()) {
      return new Response(JSON.stringify({ error: "Nome do produto é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!input.variantes?.length) {
      return new Response(JSON.stringify({ error: "Informe ao menos uma variação com preço" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const toVariantPayload = (v: VariantInput) => ({
      ...(input.atributos.length ? { values: v.valores.map((val) => ({ pt: val })) } : {}),
      price: v.preco,
      stock_management: true,
      stock: v.estoque,
      ...(v.sku ? { sku: v.sku } : {}),
    });

    // 1) Cria o produto com a primeira variação (a API exige ao menos uma na criação)
    const createBody = {
      name: { pt: input.nome.trim() },
      description: { pt: input.descricao?.trim() || "" },
      ...(input.atributos.length ? { attributes: input.atributos } : {}),
      ...(input.categorias?.length ? { categories: input.categorias } : {}),
      variants: [toVariantPayload(input.variantes[0])],
    };

    const createRes = await fetch(`${baseUrl}/products`, {
      method: "POST",
      headers,
      body: JSON.stringify(createBody),
    });
    const createResult = await createRes.json();
    if (!createRes.ok) {
      return new Response(
        JSON.stringify({ error: `Erro ao criar produto na Nuvemshop: ${JSON.stringify(createResult)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const productId = createResult.id;

    const warnings: string[] = [];

    // 2) Se houver mais de uma variação, substitui o conjunto completo
    if (input.variantes.length > 1) {
      const variantsRes = await fetch(`${baseUrl}/products/${productId}/variants`, {
        method: "PUT",
        headers,
        body: JSON.stringify(input.variantes.map(toVariantPayload)),
      });
      if (!variantsRes.ok) {
        const text = await variantsRes.text();
        warnings.push(`Produto criado, mas falhou ao cadastrar todas as variações: ${text}`);
      }
    }

    // 3) Sobe as imagens (uma a uma, na ordem)
    for (let i = 0; i < (input.imagens?.length ?? 0); i++) {
      const src = input.imagens![i];
      const imgRes = await fetch(`${baseUrl}/products/${productId}/images`, {
        method: "POST",
        headers,
        body: JSON.stringify({ src, position: i + 1 }),
      });
      if (!imgRes.ok) {
        const text = await imgRes.text();
        warnings.push(`Falha ao enviar a imagem ${i + 1}: ${text}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, nuvemshop_product_id: productId, warnings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
