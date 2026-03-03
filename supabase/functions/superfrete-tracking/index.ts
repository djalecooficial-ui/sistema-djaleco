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
    const apiKey = Deno.env.get("SUPERFRETE_API_KEY");
    if (!apiKey) throw new Error("Missing SUPERFRETE_API_KEY");

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

    const trackingCode = pedido.rastreio_codigo;
    const superfreteOrderId = pedido.superfrete_order_id;

    if (!trackingCode && !superfreteOrderId) {
      return new Response(
        JSON.stringify({ error: "Pedido sem código de rastreio ou ID SuperFrete" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to get tracking info from SuperFrete
    let trackingData: any = null;

    async function fetchJsonSafely(url: string, options?: RequestInit) {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        console.error(`Expected JSON but got ${contentType}. Status: ${res.status}. Preview: ${text.substring(0, 200)}`);
        throw new Error(`SuperFrete API returned ${res.status} with non-JSON response`);
      }
      if (!res.ok) {
        const body = await res.text();
        console.error(`SuperFrete API error ${res.status}:`, body.substring(0, 300));
        throw new Error(`SuperFrete API error: ${res.status}`);
      }
      return res.json();
    }

    if (superfreteOrderId) {
      try {
        trackingData = await fetchJsonSafely(`https://api.superfrete.com/api/v0/order/info/${superfreteOrderId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "User-Agent": "Djaleco App",
            Accept: "application/json",
          },
        });
      } catch (e) {
        console.error("SuperFrete order info error:", e.message);
      }
    }

    if (!trackingData && trackingCode) {
      try {
        const result = await fetchJsonSafely(`https://api.superfrete.com/api/v0/tracking`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Djaleco App",
            Accept: "application/json",
          },
          body: JSON.stringify({ orders: [{ tracking: trackingCode }] }),
        });
        trackingData = result?.data?.[0] || result;
      } catch (e) {
        console.error("SuperFrete tracking error:", e.message);
      }
    }

    // Extract delivery date and tracking code from response
    const updates: Record<string, any> = {};

    if (trackingData) {
      // Update tracking code if we got one
      if (trackingData.tracking && !pedido.rastreio_codigo) {
        updates.rastreio_codigo = trackingData.tracking;
      }

      // Check if delivered
      const status = trackingData.status?.toLowerCase?.() || "";
      const delivered = status === "delivered" || status === "entregue";

      if (delivered) {
        updates.etapa_producao = "Entregue";
        // Try to get delivery date
        const deliveryDate = trackingData.delivered_at || trackingData.delivery_date || trackingData.updated_at;
        if (deliveryDate) {
          updates.data_entrega = new Date(deliveryDate).toISOString();
        } else {
          updates.data_entrega = new Date().toISOString();
        }
      }
    }

    // Update pedido if we have updates
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
