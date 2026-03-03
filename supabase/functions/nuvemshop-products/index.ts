import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KNOWN_SIZES = new Set([
  "PP", "P", "M", "G", "GG", "XG", "XXG", "EG", "EGG",
  "34", "36", "38", "40", "42", "44", "46", "48", "50",
  "1", "2", "3", "4", "6", "8", "10", "12", "14", "16",
  "RN", "U", "UNICO", "ÚNICO",
]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Fetch all products with pagination
    let allProducts: any[] = [];
    let page = 1;
    const perPage = 50;
    while (true) {
      const res = await fetch(
        `${baseUrl}/products?per_page=${perPage}&page=${page}&fields=id,name,variants,images`,
        { headers }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Nuvemshop API error ${res.status}: ${text}`);
      }
      const batch = await res.json();
      if (!batch.length) break;
      allProducts = allProducts.concat(batch);
      if (batch.length < perPage) break;
      page++;
    }

    // Process products: deduplicate variants into colors[] and sizes[]
    const products = allProducts.map((p: any) => {
      const colors = new Set<string>();
      const sizes = new Set<string>();

      for (const variant of p.variants || []) {
        for (const val of variant.values || []) {
          const v = (val.pt || val.es || val.en || (typeof val === "string" ? val : "")).trim();
          if (!v) continue;
          if (KNOWN_SIZES.has(v.toUpperCase())) {
            sizes.add(v);
          } else {
            colors.add(v);
          }
        }
      }

      const mainImage = p.images?.[0]?.src || null;

      return {
        id: p.id,
        name: p.name?.pt || p.name?.es || p.name || "",
        image: mainImage,
        colors: Array.from(colors).sort(),
        sizes: Array.from(sizes),
        variant_count: (p.variants || []).length,
      };
    });

    return new Response(JSON.stringify(products), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
