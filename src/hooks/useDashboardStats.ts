import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subMonths, differenceInHours } from "date-fns";

const PRAZOS_ETAPA: Record<string, number> = {
  Corte: 4,
  Costura: 10,
  Acabamento: 2,
  Embalagem: 1,
  Despachado: 1,
};

export function useDashboardStats(periodStart: Date, periodEnd: Date) {
  return useQuery({
    queryKey: ["dashboard-stats", periodStart.toISOString(), periodEnd.toISOString()],
    queryFn: async () => {
      // Calculate previous period (same duration, immediately before)
      const durationMs = periodEnd.getTime() - periodStart.getTime();
      const prevEnd = new Date(periodStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - durationMs);

      const [pedidosRes, clientesRes, prevPedidosRes, producaoRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select("*")
          .gte("data_pedido", periodStart.toISOString())
          .lte("data_pedido", periodEnd.toISOString()),
        supabase
          .from("clientes")
          .select("id")
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
        supabase
          .from("pedidos")
          .select("id")
          .gte("data_pedido", prevStart.toISOString())
          .lte("data_pedido", prevEnd.toISOString()),
        supabase
          .from("pedidos")
          .select("etapa_producao, etapa_entrada_em")
          .not("etapa_producao", "is", null)
          .not("etapa_entrada_em", "is", null),
      ]);

      if (pedidosRes.error) throw pedidosRes.error;
      if (clientesRes.error) throw clientesRes.error;

      const pedidosMes = pedidosRes.data || [];
      const faturamentoBruto = pedidosMes.reduce((s, p) => s + Number(p.valor_bruto), 0);
      const faturamentoLiquido = pedidosMes.reduce((s, p) => s + Number(p.valor_liquido), 0);
      const ticketMedio = pedidosMes.length > 0 ? faturamentoBruto / pedidosMes.length : 0;
      const totalTaxasPagarme = pedidosMes.reduce((s, p) => s + Number(p.taxa_pagarme), 0);
      const totalFrete = pedidosMes.reduce((s, p) => s + Number(p.frete), 0);
      const totalComissoes = pedidosMes.reduce((s, p) => s + Number(p.comissao), 0);
      const lucroOperacional = faturamentoBruto - totalTaxasPagarme - totalFrete - totalComissoes;

      // Variation vs previous period
      const prevCount = prevPedidosRes.data?.length || 0;
      const variacaoPedidos = prevCount > 0
        ? Math.round(((pedidosMes.length - prevCount) / prevCount) * 100)
        : 0;

      // Production deadline status (always current, not filtered by period)
      let noPrazo = 0;
      let atencao = 0;
      let atrasado = 0;
      const activeEtapas = Object.keys(PRAZOS_ETAPA);
      for (const p of producaoRes.data || []) {
        if (!p.etapa_producao || !activeEtapas.includes(p.etapa_producao) || !p.etapa_entrada_em) continue;
        const prazo = PRAZOS_ETAPA[p.etapa_producao];
        const horasPassadas = differenceInHours(new Date(), new Date(p.etapa_entrada_em));
        const percentual = (horasPassadas / (prazo * 24)) * 100;
        if (percentual >= 90) atrasado++;
        else if (percentual >= 50) atencao++;
        else noPrazo++;
      }

      return {
        totalPedidosMes: pedidosMes.length,
        faturamentoBruto,
        faturamentoLiquido,
        ticketMedio,
        clientesNovos: clientesRes.data?.length || 0,
        totalTaxasPagarme,
        totalFrete,
        totalComissoes,
        lucroOperacional,
        variacaoPedidos,
        producao: { noPrazo, atencao, atrasado },
      };
    },
  });
}
