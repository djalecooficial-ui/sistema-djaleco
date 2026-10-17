import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    let all: any[] = [];
    let page = 1;
    const perPage = 100;
    while (true) {
      const res = await fetch(`${baseUrl}/categories?per_page=${perPage}&page=${page}&fields=id,name,parent`, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Nuvemshop API error ${res.status}: ${text}`);
      }
      const batch = await res.json();
      if (!batch.length) break;
      all = all.concat(batch);
      if (batch.length < perPage) break;
      page++;
    }

    const categories = all
      .map((c: any) => ({
        id: c.id,
        name: c.name?.pt || c.name?.es || c.name?.en || "",
        parent: c.parent,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name, "pt-BR"));

    return new Response(JSON.stringify(categories), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
