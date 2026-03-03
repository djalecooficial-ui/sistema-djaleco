import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, subMonths, format } from "date-fns";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();

      const [pedidosRes, clientesRes, allPedidosRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select("*")
          .gte("data_pedido", monthStart),
        supabase
          .from("clientes")
          .select("id")
          .gte("created_at", monthStart),
        supabase
          .from("pedidos")
          .select("valor_bruto, data_pedido, origem, etapa_producao")
          .gte("data_pedido", subMonths(now, 6).toISOString()),
      ]);

      if (pedidosRes.error) throw pedidosRes.error;
      if (clientesRes.error) throw clientesRes.error;
      if (allPedidosRes.error) throw allPedidosRes.error;

      const pedidosMes = pedidosRes.data || [];
      const faturamentoBruto = pedidosMes.reduce((s, p) => s + Number(p.valor_bruto), 0);
      const ticketMedio = pedidosMes.length > 0 ? faturamentoBruto / pedidosMes.length : 0;

      // Revenue by month
      const revenueByMonth: Record<string, number> = {};
      for (const p of allPedidosRes.data || []) {
        const key = format(new Date(p.data_pedido), "yyyy-MM");
        revenueByMonth[key] = (revenueByMonth[key] || 0) + Number(p.valor_bruto);
      }

      // Orders by origin
      const byOrigin: Record<string, number> = {};
      for (const p of allPedidosRes.data || []) {
        byOrigin[p.origem] = (byOrigin[p.origem] || 0) + 1;
      }

      // Production status
      const byEtapa: Record<string, number> = {};
      for (const p of allPedidosRes.data || []) {
        const etapa = p.etapa_producao || "Sem etapa";
        byEtapa[etapa] = (byEtapa[etapa] || 0) + 1;
      }

      return {
        totalPedidosMes: pedidosMes.length,
        faturamentoBruto,
        ticketMedio,
        clientesNovos: clientesRes.data?.length || 0,
        revenueByMonth,
        byOrigin,
        byEtapa,
      };
    },
  });
}
