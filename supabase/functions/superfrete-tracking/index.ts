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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { pedido_id } = await req.json();
    if (!pedido_id) throw new Error("pedido_id is required");

    // Get pedido
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id, rastreio_codigo, superfrete_order_id")
      .eq("id", pedido_id)
      .single();

    if (pedidoError || !pedido) throw new Error("Pedido not found");

    const superfreteOrderId = pedido.superfrete_order_id;
    const trackingCode = pedido.rastreio_codigo;

    let trackingData: any = null;
    let source = "";

    // Strategy 1: SuperFrete (if we have a superfrete_order_id)
    if (superfreteOrderId) {
      const apiKey = Deno.env.get("SUPERFRETE_API_KEY");
      if (!apiKey) throw new Error("Missing SUPERFRETE_API_KEY");

      const res = await fetch(`https://api.superfrete.com/api/v0/order/info/${superfreteOrderId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "Djaleco App (contato@djaleco.com)",
          Accept: "application/json",
        },
      });

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json") && res.ok) {
        trackingData = await res.json();
        source = "superfrete";
      } else {
        console.warn(`SuperFrete failed (status ${res.status}), falling back to Seu Rastreio`);
      }
    }

    // Strategy 2: Seu Rastreio (if we have a tracking code and SuperFrete didn't work)
    if (!trackingData && trackingCode) {
      const seuRastreioKey = Deno.env.get("SEURASTREIO_API_KEY");
      if (!seuRastreioKey) throw new Error("Missing SEURASTREIO_API_KEY");

      const srRes = await fetch(`https://seurastreio.com.br/api/public/rastreio/${encodeURIComponent(trackingCode)}`, {
        headers: {
          Authorization: `Bearer ${seuRastreioKey}`,
          Accept: "application/json",
        },
      });

      if (srRes.ok) {
        trackingData = await srRes.json();
        source = "seurastreio";
      } else {
        const errText = await srRes.text();
        console.warn(`Seu Rastreio failed (status ${srRes.status}): ${errText}`);
      }
    }

    if (!trackingData) {
      return new Response(
        JSON.stringify({ error: "Não foi possível consultar o rastreio. Verifique o código de rastreio.", no_tracking: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract updates
    const updates: Record<string, any> = {};

    if (source === "superfrete") {
      if (trackingData.tracking && !pedido.rastreio_codigo) {
        updates.rastreio_codigo = trackingData.tracking;
      }
      const status = (trackingData.status || "").toLowerCase();
      if (status === "delivered") {
        updates.etapa_producao = "Entregue";
        updates.data_entrega = trackingData.updated_at ? new Date(trackingData.updated_at).toISOString() : new Date().toISOString();
      }
    } else if (source === "seurastreio") {
      // Seu Rastreio returns { codigo, status, success, eventoMaisRecente: { descricao, data, local } }
      const evento = trackingData.eventoMaisRecente;
      if (evento) {
        const desc = (evento.descricao || "").toLowerCase();
        if (desc.includes("entregue")) {
          updates.etapa_producao = "Entregue";
          updates.data_entrega = evento.data ? new Date(evento.data).toISOString() : new Date().toISOString();
        }
      }
    }

    // Update pedido if needed
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("pedidos")
        .update(updates)
        .eq("id", pedido_id);
      if (updateError) console.error("Error updating pedido:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        source,
        tracking: trackingData,
        updates,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
