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
  estoque: number | null; // null = estoque ilimitado (sem controle)
  sku?: string;
}

interface ImagemInput {
  url: string;
  cor?: string; // se informado, amarra essa foto à variação dessa cor via image_id
}

interface CreateProductInput {
  nome: string;
  descricao?: string;
  categorias?: number[];
  atributos: string[];
  variantes: VariantInput[];
  imagens?: ImagemInput[];
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

    const corIndex = input.atributos.findIndex((a) => a.toLowerCase() === "cor");

    const basicVariantPayload = (v: VariantInput) => ({
      ...(input.atributos.length ? { values: v.valores.map((val) => ({ pt: val })) } : {}),
      price: v.preco,
      ...(v.estoque === null
        ? { stock_management: false }
        : { stock_management: true, stock: v.estoque }),
      ...(v.sku ? { sku: v.sku } : {}),
    });

    // 1) Cria o produto já com todas as fotos e a primeira variação
    //    (a API exige ao menos uma variação na criação; o restante vem no passo 3)
    const createBody = {
      name: { pt: input.nome.trim() },
      description: { pt: input.descricao?.trim() || "" },
      ...(input.atributos.length ? { attributes: input.atributos } : {}),
      ...(input.categorias?.length ? { categories: input.categorias } : {}),
      ...(input.imagens?.length ? { images: input.imagens.map((i) => ({ src: i.url })) } : {}),
      variants: [basicVariantPayload(input.variantes[0])],
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

    // 2) Monta o mapa cor -> image_id a partir das fotos recém-criadas
    //    (a Nuvemshop devolve o id de cada imagem na mesma ordem em que foram enviadas)
    const corParaImageId = new Map<string, number>();
    if (input.imagens?.length && Array.isArray(createResult.images)) {
      input.imagens.forEach((img, i) => {
        const cor = img.cor?.trim().toLowerCase();
        const criada = createResult.images[i];
        if (cor && criada?.id) corParaImageId.set(cor, criada.id);
      });
    }

    const variantPayloadComFoto = (v: VariantInput) => {
      const payload: Record<string, unknown> = basicVariantPayload(v);
      if (corIndex >= 0) {
        const cor = v.valores[corIndex]?.trim().toLowerCase();
        const imageId = cor ? corParaImageId.get(cor) : undefined;
        if (imageId) payload.image_id = imageId;
      }
      return payload;
    };

    // 3) Substitui o conjunto completo de variações, agora já com image_id de cada cor
    const variantsRes = await fetch(`${baseUrl}/products/${productId}/variants`, {
      method: "PUT",
      headers,
      body: JSON.stringify(input.variantes.map(variantPayloadComFoto)),
    });
    if (!variantsRes.ok) {
      const text = await variantsRes.text();
      warnings.push(`Produto criado, mas falhou ao cadastrar as variações com as fotos vinculadas: ${text}`);
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
