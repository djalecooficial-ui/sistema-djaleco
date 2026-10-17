import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AddColorInput {
  product_id: number;
  cor: string;
  image_url: string;
  tamanhos: string[];
  preco?: string; // se omitido, usa o preco da primeira variante existente
  estoque?: number | null; // se omitido, usa o mesmo esquema da primeira variante existente
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
    if (!storeId || !accessToken) throw new Error("Missing Nuvemshop credentials");

    const baseUrl = `https://api.nuvemshop.com.br/v1/${storeId}`;
    const headers = {
      Authentication: `bearer ${accessToken}`,
      "User-Agent": "Djaleco App (contato@djaleco.com.br)",
      "Content-Type": "application/json",
    };

    const input: AddColorInput = await req.json();
    if (!input.product_id || !input.cor?.trim() || !input.image_url || !input.tamanhos?.length) {
      return new Response(JSON.stringify({ error: "product_id, cor, image_url e tamanhos são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Confirma atributos do produto (pra saber a posicao do atributo "Cor")
    const prodRes = await fetch(`${baseUrl}/products/${input.product_id}?fields=id,attributes`, { headers });
    const produto = await prodRes.json();
    if (!prodRes.ok) {
      return new Response(JSON.stringify({ error: `Produto não encontrado: ${JSON.stringify(produto)}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const atributos: string[] = (produto.attributes ?? []).map((a: any) => a.pt || a.es || a.en || "");
    const corIndex = atributos.findIndex((a) => a.toLowerCase() === "cor");
    if (corIndex === -1) {
      return new Response(JSON.stringify({ error: "Este produto não tem o atributo Cor configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Sobe a nova foto
    const imgRes = await fetch(`${baseUrl}/products/${input.product_id}/images`, {
      method: "POST",
      headers,
      body: JSON.stringify({ src: input.image_url, position: 999 }),
    });
    const imgResult = await imgRes.json();
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ error: `Erro ao enviar a foto: ${JSON.stringify(imgResult)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const novaImageId = imgResult.id;

    // 3) Le as variantes existentes (com paginacao correta) pra nao perder nenhuma no PUT
    const varRes = await fetch(`${baseUrl}/products/${input.product_id}/variants?per_page=200`, { headers });
    const existentes = await varRes.json();
    if (!Array.isArray(existentes) || existentes.length === 0) {
      return new Response(JSON.stringify({ error: "Não foi possível ler as variações existentes" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const referencia = existentes[0];
    const precoFinal = input.preco ?? referencia.price;
    const estoqueInformado = input.estoque !== undefined;
    const estoqueFinal = estoqueInformado ? input.estoque : (referencia.stock_management ? referencia.stock : null);

    const existentesPayload = existentes.map((v: any) => ({
      values: v.values,
      price: v.price,
      ...(v.stock_management ? { stock_management: true, stock: v.stock } : { stock_management: false }),
      ...(v.image_id ? { image_id: v.image_id } : {}),
      ...(v.weight ? { weight: v.weight } : {}),
      ...(v.width ? { width: v.width } : {}),
      ...(v.height ? { height: v.height } : {}),
      ...(v.depth ? { depth: v.depth } : {}),
      ...(v.age_group ? { age_group: v.age_group } : {}),
      ...(v.gender ? { gender: v.gender } : {}),
    }));

    const novasPayload = input.tamanhos.map((tamanho) => {
      const valores = atributos.map((_, i) => ({ pt: i === corIndex ? input.cor.trim() : tamanho }));
      return {
        values: valores,
        price: precoFinal,
        ...(estoqueFinal === null ? { stock_management: false } : { stock_management: true, stock: estoqueFinal }),
        image_id: novaImageId,
        ...(referencia.weight ? { weight: referencia.weight } : {}),
        ...(referencia.width ? { width: referencia.width } : {}),
        ...(referencia.height ? { height: referencia.height } : {}),
        ...(referencia.depth ? { depth: referencia.depth } : {}),
        ...(referencia.age_group ? { age_group: referencia.age_group } : {}),
        ...(referencia.gender ? { gender: referencia.gender } : {}),
      };
    });

    const putRes = await fetch(`${baseUrl}/products/${input.product_id}/variants`, {
      method: "PUT",
      headers,
      body: JSON.stringify([...existentesPayload, ...novasPayload]),
    });
    const putResult = await putRes.json();
    if (!putRes.ok) {
      return new Response(JSON.stringify({ error: `Erro ao criar as variações da nova cor: ${JSON.stringify(putResult)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true, nova_image_id: novaImageId, total_variantes: putResult.length }),
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
