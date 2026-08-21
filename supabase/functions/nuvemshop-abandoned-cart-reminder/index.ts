import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Carrinho precisa estar abandonado há pelo menos esse tempo antes de
// virarmos sugestão de mensagem — dá chance da pessoa finalizar sozinha.
const WAIT_HOURS = 3;
// Não considera carrinhos mais velhos que isso — mensagem de recuperação
// perde o sentido (e o timing) depois de muito tempo.
const MAX_AGE_HOURS = 48;
const MAX_POR_EXECUCAO = 20;

function formatarProdutos(products: { name: string; quantity: number }[]): string {
  const nomes = products.slice(0, 3).map((p) => (p.quantity > 1 ? `${p.quantity}x ${p.name}` : p.name));
  if (products.length > 3) nomes.push(`e mais ${products.length - 3} item(ns)`);
  return nomes.join(", ");
}

// Números de celular brasileiros podem aparecer com ou sem o "nono dígito"
// (55DDD9XXXXXXXX vs 55DDDXXXXXXXX) dependendo da origem (loja vs WhatsApp).
// Sem checar as duas formas, a mesma pessoa vira dois contatos diferentes.
function telefoneAlternativo(tel: string): string | null {
  const semNono = tel.match(/^(55\d{2})9(\d{8})$/);
  if (semNono) return `${semNono[1]}${semNono[2]}`;
  const comNono = tel.match(/^(55\d{2})(\d{8})$/);
  if (comNono) return `${comNono[1]}9${comNono[2]}`;
  return null;
}

async function findOrCreateContato(supabase: any, telefoneLimpo: string, nomeCliente: string) {
  const alt = telefoneAlternativo(telefoneLimpo);
  const candidatos = alt ? [telefoneLimpo, alt] : [telefoneLimpo];
  const { data: existente } = await supabase
    .from("crm_contacts")
    .select("id, tags, status")
    .in("telefone", candidatos)
    .maybeSingle();
  if (existente) return existente as { id: string; tags: string[] | null; status: string };

  const { data: criado, error } = await supabase
    .from("crm_contacts")
    .insert({ nome: nomeCliente || telefoneLimpo, telefone: telefoneLimpo, origem: "site", status: "carrinho_abandonado" })
    .select("id, tags, status")
    .single();
  if (error) {
    const { data: retry } = await supabase
      .from("crm_contacts")
      .select("id, tags, status")
      .in("telefone", candidatos)
      .maybeSingle();
    return retry as { id: string; tags: string[] | null; status: string } | null;
  }
  return criado as { id: string; tags: string[] | null; status: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const storeId = Deno.env.get("NUVEMSHOP_STORE_ID");
    const accessToken = Deno.env.get("NUVEMSHOP_ACCESS_TOKEN");
    if (!storeId || !accessToken) throw new Error("Missing Nuvemshop credentials");

    const baseUrl = `https://api.tiendanube.com/v1/${storeId}`;
    const headers = {
      Authentication: `bearer ${accessToken}`,
      "User-Agent": "Djaleco App (contato@djaleco.com.br)",
      "Content-Type": "application/json",
    };

    const limiteRecente = new Date(Date.now() - WAIT_HOURS * 60 * 60 * 1000);
    const limiteAntigo = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000);

    let allCheckouts: any[] = [];
    let page = 1;
    const perPage = 50;
    while (true) {
      const res = await fetch(
        `${baseUrl}/checkouts?per_page=${perPage}&page=${page}&created_at_min=${limiteAntigo.toISOString()}`,
        { headers },
      );
      if (!res.ok) throw new Error(`Nuvemshop API error ${res.status}: ${await res.text()}`);
      const batch = await res.json();
      if (!batch.length) break;
      allCheckouts = allCheckouts.concat(batch);
      if (batch.length < perPage) break;
      page++;
    }

    const candidatos = allCheckouts.filter((c: any) => {
      if (c.completed_at) return false;
      const criado = new Date(c.created_at);
      return criado <= limiteRecente && criado >= limiteAntigo;
    });

    let processed = 0;

    for (const checkout of candidatos) {
      if (processed >= MAX_POR_EXECUCAO) break;

      const telefoneBruto = checkout.customer?.phone || checkout.contact_phone || null;
      if (!telefoneBruto) continue;
      const telefone = String(telefoneBruto).replace(/\D/g, "");
      if (!telefone) continue;

      const nomeCliente = checkout.customer?.name || checkout.contact_name || "";
      const primeiroNome = nomeCliente.trim().split(/\s+/)[0] || "";

      const contato = await findOrCreateContato(supabase, telefone, nomeCliente);
      if (!contato) {
        console.error("[cart-reminder] não foi possível criar/achar contato para", telefone);
        continue;
      }

      const tagCarrinho = `Carrinho Abandonado #${checkout.id}`;
      if ((contato.tags ?? []).includes(tagCarrinho)) continue; // já tratado antes

      const products = (checkout.products || []).map((p: any) => ({
        name: p.name?.pt || p.name?.es || p.name || "Produto",
        quantity: p.quantity || 1,
      }));
      const recoveryUrl = checkout.checkout_url || checkout.recovery_url || null;

      const mensagens = [
        `Oi${primeiroNome ? " " + primeiroNome : ""}! Vi que você deixou ${formatarProdutos(products) || "alguns itens"} no carrinho lá no nosso site 🛍️`,
        ...(recoveryUrl ? [`Se quiser finalizar, é só continuar por aqui: ${recoveryUrl}`] : []),
        "Ficou com alguma dúvida sobre tamanho, cor ou prazo? Me chama que te ajudo!",
      ];

      const novasTags = Array.from(new Set([...(contato.tags ?? []), tagCarrinho]));
      const patch: Record<string, unknown> = {
        tags: novasTags,
        ai_suggestion: mensagens,
        ai_suggestion_at: new Date().toISOString(),
      };
      // Só define o status inicial se o contato ainda não tiver avançado
      // em nenhum outro fluxo (evita voltar alguém que já está mais à frente).
      if (contato.status === "carrinho_abandonado") {
        patch.status = "carrinho_abandonado";
      }

      await supabase.from("crm_contacts").update(patch).eq("id", contato.id);
      processed++;
    }

    return new Response(JSON.stringify({ found: candidatos.length, processed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("nuvemshop-abandoned-cart-reminder error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
