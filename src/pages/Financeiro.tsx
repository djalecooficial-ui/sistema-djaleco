import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidos, useUpdatePedido } from "@/hooks/usePedidos";
import { useVendedores } from "@/hooks/useVendedores";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useState, useMemo } from "react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Link, Wallet, Trash2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type ComissaoPagamento = {
  id: string;
  vendedor_id: string;
  valor: number;
  data_pagamento: string;
  observacoes: string | null;
  created_at: string;
};

function useComissaoPagamentos() {
  return useQuery<ComissaoPagamento[]>({
    queryKey: ["comissao_pagamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comissao_pagamentos")
        .select("*")
        .order("data_pagamento", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComissaoPagamento[];
    },
  });
}

// Helper: extract local year/month from date string without timezone shift
function getLocalYearMonth(dateStr: string): { year: number; month: number } {
  // If ISO date "YYYY-MM-DD..." extract directly from string
  const match = dateStr?.match(/^(\d{4})-(\d{2})/);
  if (match) {
    return { year: parseInt(match[1]), month: parseInt(match[2]) };
  }
  // Fallback: use Date with noon to avoid timezone shift
  const d = new Date(dateStr);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function getLocalDate(dateStr: string): Date {
  // Parse "YYYY-MM-DD" as local date (noon to avoid shift)
  const match = dateStr?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12);
  }
  return new Date(dateStr);
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

type PagarmeCharge = {
  id: string;
  created_at: string;
  paid_at: string | null;
  status: string;
  amount: number;
  paid_amount: number;
  gateway_fee: number;
  order_code: string | null;
  payment_method: string;
  installments: number;
};

function usePagarmeExtrato(params: { year?: string; month?: string; start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ["pagarme-extrato", params],
    queryFn: async () => {
      const query = new URLSearchParams();
      if (params.year) query.set("year", params.year);
      if (params.month) query.set("month", params.month);
      if (params.start_date) query.set("start_date", params.start_date);
      if (params.end_date) query.set("end_date", params.end_date);
      const { data, error } = await supabase.functions.invoke(`pagarme-extrato?${query.toString()}`, {
        method: "GET",
      });
      if (error) throw new Error("Falha ao carregar extrato Pagar.me");
      return data as { charges: PagarmeCharge[]; summary: { total_bruto: number; total_liquido: number; total_taxas: number; count: number } };
    },
    enabled: !!(params.year || params.start_date),
  });
}

const STATUS_MAP: Record<string, string> = {
  paid: "Pago", pending: "Pendente", canceled: "Cancelado", failed: "Falhou",
  overpaid: "Pago a mais", underpaid: "Pago a menos", processing: "Processando",
};

function groupByDeposit(charges: PagarmeCharge[]) {
  const groups: Record<string, PagarmeCharge[]> = {};
  for (const c of charges) {
    const key = c.paid_at ? format(new Date(c.paid_at), "dd/MM/yyyy") : "Sem data";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === "Sem data") return 1;
    if (b === "Sem data") return -1;
    return b.localeCompare(a);
  });
}

const MONTHS_LIST = [
  { value: "all", label: "Todos" },
  { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" }, { value: "3", label: "Março" },
  { value: "4", label: "Abril" }, { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
  { value: "7", label: "Julho" }, { value: "8", label: "Agosto" }, { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" }, { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
];

export default function Financeiro() {
  const { data: pedidos } = usePedidos();
  const { data: vendedores } = useVendedores();
  const updatePedido = useUpdatePedido();
  const { settings } = useSystemSettings();
  const { data: pagamentos } = useComissaoPagamentos();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"visao" | "comissoes" | "pagarme">("visao");

  // === Lançamentos de comissão (saldo corrido, não mais por pedido) ===
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [pagamentoVendedorId, setPagamentoVendedorId] = useState<string>("");
  const [pagamentoValor, setPagamentoValor] = useState("");
  const [pagamentoData, setPagamentoData] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [pagamentoObs, setPagamentoObs] = useState("");
  const [deletePagamentoId, setDeletePagamentoId] = useState<string | null>(null);

  const registrarPagamento = useMutation({
    mutationFn: async () => {
      const valor = parseFloat(pagamentoValor.replace(",", "."));
      if (!pagamentoVendedorId) throw new Error("Selecione o vendedor");
      if (isNaN(valor) || valor <= 0) throw new Error("Valor inválido");
      const { error } = await supabase.from("comissao_pagamentos").insert({
        vendedor_id: pagamentoVendedorId,
        valor,
        data_pagamento: pagamentoData,
        observacoes: pagamentoObs.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pagamento registrado!");
      qc.invalidateQueries({ queryKey: ["comissao_pagamentos"] });
      setPagamentoDialogOpen(false);
      setPagamentoValor("");
      setPagamentoObs("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registrar pagamento"),
  });

  const excluirPagamento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("comissao_pagamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["comissao_pagamentos"] });
      setDeletePagamentoId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover lançamento"),
  });

  const openPagamentoDialog = (vendedorId: string, valorSugerido?: number) => {
    setPagamentoVendedorId(vendedorId);
    setPagamentoValor(valorSugerido ? valorSugerido.toFixed(2).replace(".", ",") : "");
    setPagamentoData(format(new Date(), "yyyy-MM-dd"));
    setPagamentoObs("");
    setPagamentoDialogOpen(true);
  };

  // === Visão Geral filters ===
  const currentYear = new Date().getFullYear().toString();
  const [visaoFilterType, setVisaoFilterType] = useState<"mes" | "custom">("mes");
  const [visaoYear, setVisaoYear] = useState(currentYear);
  const [visaoMonth, setVisaoMonth] = useState("all");
  const [visaoStartDate, setVisaoStartDate] = useState("");
  const [visaoEndDate, setVisaoEndDate] = useState("");
  const [visaoVendedor, setVisaoVendedor] = useState("all");
  const [visaoOrigem, setVisaoOrigem] = useState("all");

  // Pagarme filters
  const currentMonth = (new Date().getMonth() + 1).toString();
  const [pgFilterType, setPgFilterType] = useState<"mes" | "custom">("mes");
  const [pgYear, setPgYear] = useState(currentYear);
  const [pgMonth, setPgMonth] = useState(currentMonth);
  const [pgStartDate, setPgStartDate] = useState("");
  const [pgEndDate, setPgEndDate] = useState("");
  const [pgSubTab, setPgSubTab] = useState<"pagos" | "pendentes">("pagos");

  // Comissão filters
  const [comFilterType, setComFilterType] = useState<"mes" | "custom">("mes");
  const [comYear, setComYear] = useState(currentYear);
  const [comMonth, setComMonth] = useState("all");
  const [comStartDate, setComStartDate] = useState("");
  const [comEndDate, setComEndDate] = useState("");
  const [comVendedor, setComVendedor] = useState("all");

  // Comissão inline edit state — now edits percentage
  const [editingComissao, setEditingComissao] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Multi-select TED grouping
  const [selectedTedPedidos, setSelectedTedPedidos] = useState<Set<string>>(new Set());

  const pagarmeParams = pgFilterType === "mes"
    ? { year: pgYear, month: pgMonth }
    : { start_date: pgStartDate, end_date: pgEndDate };

  const { data: pagarmeData, isLoading: pgLoading } = usePagarmeExtrato(pagarmeParams);

  const allPedidos = pedidos || [];

  // Saldo devedor de comissão: soma gerada desde a data de corte (pedidos
  // antigos não entram, ficam como já estavam) menos soma de lançamentos de
  // pagamento — não é mais por pedido individual, é um saldo corrido.
  const corteComissao = settings.comissao_corte_data || null;
  const pedidosParaSaldo = useMemo(() => {
    if (!corteComissao) return [];
    const corte = getLocalDate(corteComissao);
    return allPedidos.filter(
      (p) =>
        Number(p.comissao) > 0 &&
        p.status_pagamento !== "pendente" &&
        p.comissao_considerar_saldo !== false &&
        getLocalDate(p.data_pedido) >= corte,
    );
  }, [allPedidos, corteComissao]);

  const saldoPorVendedor = useMemo(() => {
    const map: Record<string, { gerado: number; pago: number }> = {};
    for (const p of pedidosParaSaldo) {
      const vid = p.vendedor_id || "sem_vendedor";
      if (!map[vid]) map[vid] = { gerado: 0, pago: 0 };
      map[vid].gerado += Number(p.comissao);
    }
    for (const pg of pagamentos ?? []) {
      if (!map[pg.vendedor_id]) map[pg.vendedor_id] = { gerado: 0, pago: 0 };
      map[pg.vendedor_id].pago += Number(pg.valor);
    }
    return map;
  }, [pedidosParaSaldo, pagamentos]);

  // Alocação automática: distribui os lançamentos de pagamento nos pedidos
  // (do mais antigo pro mais novo, por vendedor) pra saber até onde cada
  // pagamento "pagou" — pedido vira pago quando o acumulado cobre a comissão
  // inteira; se parar no meio, mostra o percentual já coberto daquele pedido.
  const alocacaoPorPedido = useMemo(() => {
    const map: Record<string, { pago: boolean; percentual: number }> = {};
    const porVendedor: Record<string, typeof pedidosParaSaldo> = {};
    for (const p of pedidosParaSaldo) {
      const vid = p.vendedor_id || "sem_vendedor";
      (porVendedor[vid] ??= []).push(p);
    }
    const pagoPorVendedor: Record<string, number> = {};
    for (const pg of pagamentos ?? []) {
      pagoPorVendedor[pg.vendedor_id] = (pagoPorVendedor[pg.vendedor_id] || 0) + Number(pg.valor);
    }
    for (const vid of Object.keys(porVendedor)) {
      const ordenados = [...porVendedor[vid]].sort(
        (a, b) => getLocalDate(a.data_pedido).getTime() - getLocalDate(b.data_pedido).getTime(),
      );
      let saldoDisponivel = pagoPorVendedor[vid] || 0;
      for (const p of ordenados) {
        const comissao = Number(p.comissao);
        if (saldoDisponivel >= comissao) {
          map[p.id] = { pago: true, percentual: 100 };
          saldoDisponivel -= comissao;
        } else if (saldoDisponivel > 0) {
          map[p.id] = { pago: false, percentual: Math.round((saldoDisponivel / comissao) * 100) };
          saldoDisponivel = 0;
        } else {
          map[p.id] = { pago: false, percentual: 0 };
        }
      }
    }
    return map;
  }, [pedidosParaSaldo, pagamentos]);

  // Filtered pedidos for Visão Geral
  const filteredPedidos = useMemo(() => {
    let filtered = [...allPedidos];

    if (visaoFilterType === "mes") {
      // Filter by year
      filtered = filtered.filter(p => {
        const { year } = getLocalYearMonth(p.data_pedido);
        return year.toString() === visaoYear;
      });
      // Filter by month if not "all"
      if (visaoMonth !== "all") {
        filtered = filtered.filter(p => {
          const { month } = getLocalYearMonth(p.data_pedido);
          return month.toString() === visaoMonth;
        });
      }
    } else {
      // Custom date range
      if (visaoStartDate) {
        const start = getLocalDate(visaoStartDate);
        filtered = filtered.filter(p => getLocalDate(p.data_pedido) >= start);
      }
      if (visaoEndDate) {
        const end = getLocalDate(visaoEndDate);
        end.setHours(23, 59, 59);
        filtered = filtered.filter(p => getLocalDate(p.data_pedido) <= end);
      }
    }

    // Filter by vendedor
    if (visaoVendedor !== "all") {
      filtered = filtered.filter(p => p.vendedor_id === visaoVendedor);
    }

    // Filter by origem
    if (visaoOrigem !== "all") {
      filtered = filtered.filter(p => p.origem === visaoOrigem);
    }

    return filtered;
  }, [allPedidos, visaoFilterType, visaoYear, visaoMonth, visaoStartDate, visaoEndDate, visaoVendedor, visaoOrigem]);

  // Only paid orders for financial metrics
  const paidPedidos = useMemo(() => filteredPedidos.filter(p => p.status_pagamento !== "pendente"), [filteredPedidos]);

  const totalBruto = paidPedidos.reduce((s, p) => s + Number(p.valor_bruto), 0);
  const totalLiquido = paidPedidos.reduce((s, p) => s + Number(p.valor_liquido), 0);
  const totalFrete = paidPedidos.reduce((s, p) => s + Number(p.frete), 0);
  const totalTaxas = paidPedidos.reduce((s, p) => s + Number(p.taxa_pagarme), 0);
  const totalComissoes = paidPedidos.reduce((s, p) => s + Number(p.comissao), 0);

  const revenueByMonth: Record<string, number> = {};
  const ordersByMonth: Record<string, number> = {};
  paidPedidos.forEach((p) => {
    const { year, month } = getLocalYearMonth(p.data_pedido);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    revenueByMonth[key] = (revenueByMonth[key] || 0) + Number(p.valor_bruto);
    ordersByMonth[key] = (ordersByMonth[key] || 0) + 1;
  });
  const chartData = Object.entries(revenueByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, valor]) => {
      const [y, m] = month.split("-").map(Number);
      const label = format(new Date(y, m - 1, 15), "MMM/yy", { locale: ptBR });
      return { name: label, valor, pedidos: ordersByMonth[month] || 0 };
    });

  // All pedidos with comissao (exclude unpaid/pending), filtered by period
  const comissoesTodas = useMemo(() => {
    let filtered = allPedidos.filter((p) => Number(p.comissao) > 0 && p.status_pagamento !== "pendente");

    if (comFilterType === "mes") {
      filtered = filtered.filter(p => getLocalYearMonth(p.data_pedido).year.toString() === comYear);
      if (comMonth !== "all") {
        filtered = filtered.filter(p => getLocalYearMonth(p.data_pedido).month.toString() === comMonth);
      }
    } else {
      if (comStartDate) filtered = filtered.filter(p => getLocalDate(p.data_pedido) >= getLocalDate(comStartDate));
      if (comEndDate) {
        const end = getLocalDate(comEndDate);
        end.setHours(23, 59, 59);
        filtered = filtered.filter(p => getLocalDate(p.data_pedido) <= end);
      }
    }

    if (comVendedor !== "all") {
      filtered = filtered.filter(p => p.vendedor_id === comVendedor);
    }

    return filtered;
  }, [allPedidos, comFilterType, comYear, comMonth, comStartDate, comEndDate, comVendedor]);

  // Summary totals for filtered commissions
  const comTotalBruto = comissoesTodas.reduce((s, p) => s + Number(p.valor_bruto), 0);
  const comTotalFrete = comissoesTodas.reduce((s, p) => s + Number(p.frete), 0);
  const comTotalTaxa = comissoesTodas.reduce((s, p) => s + Number(p.taxa_pagarme), 0);
  const comTotalTed = comissoesTodas.reduce((s, p) => s + Number(p.taxa_ted), 0);
  const comTotalLiquido = comissoesTodas.reduce((s, p) => s + Number(p.valor_liquido), 0);
  const comTotalComissao = comissoesTodas.reduce((s, p) => s + Number(p.comissao), 0);

  const toggleTedSelect = (id: string) => {
    setSelectedTedPedidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAgruparTed = () => {
    if (selectedTedPedidos.size < 2) {
      toast.error("Selecione pelo menos 2 pedidos para agrupar o TED");
      return;
    }
    const selected = comissoesTodas.filter(p => selectedTedPedidos.has(p.id));
    // Sum all TED fees from selected, then redistribute equally
    const totalTed = selected.reduce((s, p) => s + Number(p.taxa_ted), 0);
    const tedPerPedido = Math.round((totalTed / selected.length) * 100) / 100;
    
    // Actually the idea is: they share ONE TED fee (R$3.67 typically)
    // So we set one TED fee split across all selected orders
    const singleTed = 3.67; // default TED fee
    const tedEach = Math.round((singleTed / selected.length) * 100) / 100;
    
    let completed = 0;
    for (const p of selected) {
      const valorBruto = Number(p.valor_bruto);
      const frete = Number(p.frete);
      const taxaPagarme = Number(p.taxa_pagarme);
      const valorLiquido = valorBruto - frete - taxaPagarme - tedEach;
      
      // Recalculate commission
      const vendedor = vendedores?.find(v => v.id === p.vendedor_id);
      let comissao = 0;
      if (vendedor) {
        const taxaComissao = p.origem === "whatsapp" ? vendedor.taxa_comissao_whatsapp : vendedor.taxa_comissao_site;
        const base = valorBruto - taxaPagarme - tedEach - frete;
        comissao = base > 0 ? base * (taxaComissao / 100) : 0;
      }
      
      updatePedido.mutate(
        { id: p.id, taxa_ted: tedEach, valor_liquido: valorLiquido, comissao },
        {
          onSuccess: () => {
            completed++;
            if (completed === selected.length) {
              toast.success(`TED único de R$ ${singleTed.toFixed(2)} dividido entre ${selected.length} pedidos (R$ ${tedEach.toFixed(2)} cada)`);
              setSelectedTedPedidos(new Set());
            }
          },
        }
      );
    }
  };

  // Now saves percentage and recalculates value
  const handleSaveComissao = (pedidoId: string) => {
    const percentual = parseFloat(editValue);
    if (isNaN(percentual) || percentual < 0 || percentual > 100) {
      toast.error("Percentual inválido (0-100)");
      return;
    }
    const pedido = allPedidos.find(p => p.id === pedidoId);
    if (!pedido) return;
    const novaComissao = Number(pedido.valor_liquido) * (percentual / 100);
    updatePedido.mutate(
      { id: pedidoId, comissao: novaComissao },
      {
        onSuccess: () => {
          toast.success("Comissão atualizada!");
          setEditingComissao(null);
        },
      }
    );
  };

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
  const months = [
    { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" }, { value: "3", label: "Março" },
    { value: "4", label: "Abril" }, { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
    { value: "7", label: "Julho" }, { value: "8", label: "Agosto" }, { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" }, { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  const chargesPagos = pagarmeData?.charges?.filter((c) => c.status === "paid") || [];
  const chargesPendentes = pagarmeData?.charges?.filter((c) => c.status !== "paid") || [];
  const depositGroups = groupByDeposit(chargesPagos);

  // Helper: get current percentage for a pedido
  const getPercentual = (p: typeof allPedidos[0]) => {
    const liq = Number(p.valor_liquido);
    const com = Number(p.comissao);
    if (liq <= 0) return 0;
    return Math.round((com / liq) * 100 * 100) / 100;
  };

  // Status de pagamento da comissão, calculado automaticamente pela
  // alocação dos lançamentos. O checkbox deixa tirar um pedido específico
  // do cálculo (ex: repasse do Pagar.me ainda não caiu) sem mexer no
  // pedido em si — só aparece pros pedidos que estão dentro do escopo do
  // saldo corrido (a partir da data de corte); pedidos antigos não têm
  // esse controle porque não entram no cálculo de qualquer forma.
  const renderStatusComissao = (p: typeof allPedidos[0]) => {
    const dentroDoEscopo = corteComissao && getLocalDate(p.data_pedido) >= getLocalDate(corteComissao);
    if (!dentroDoEscopo) return null;

    const considerar = p.comissao_considerar_saldo !== false;
    const toggle = (checked: boolean) =>
      updatePedido.mutate({ id: p.id, comissao_considerar_saldo: checked });

    let badge;
    if (!considerar) {
      badge = <Badge variant="outline" className="text-muted-foreground font-normal">Fora do cálculo</Badge>;
    } else {
      const status = alocacaoPorPedido[p.id];
      if (!status || status.percentual === 0) {
        badge = <Badge variant="outline" className="text-muted-foreground font-normal">Não pago</Badge>;
      } else if (status.pago) {
        badge = <Badge className="bg-green-600 hover:bg-green-600 font-normal">Pago</Badge>;
      } else {
        badge = <Badge variant="secondary" className="font-normal">{status.percentual}% pago</Badge>;
      }
    }

    return (
      <div className="flex items-center gap-1.5">
        <Checkbox
          checked={considerar}
          onCheckedChange={(v) => toggle(!!v)}
          title="Considerar este pedido no cálculo do saldo de comissão"
        />
        {badge}
      </div>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Financeiro</h1>

        <div className="flex gap-2 overflow-x-auto">
          <Button variant={tab === "visao" ? "default" : "outline"} size="sm" onClick={() => setTab("visao")}>Visão Geral</Button>
          <Button variant={tab === "comissoes" ? "default" : "outline"} size="sm" onClick={() => setTab("comissoes")}>Comissões</Button>
          <Button variant={tab === "pagarme" ? "default" : "outline"} size="sm" onClick={() => setTab("pagarme")}>Pagar.me</Button>
        </div>

        {tab === "visao" && (
          <>
            {/* Filters */}
            <Card className="p-3 sm:p-4">
              <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                <div className="flex gap-2">
                  <Button variant={visaoFilterType === "mes" ? "default" : "outline"} size="sm" onClick={() => setVisaoFilterType("mes")}>Por Mês</Button>
                  <Button variant={visaoFilterType === "custom" ? "default" : "outline"} size="sm" onClick={() => setVisaoFilterType("custom")}>Personalizado</Button>
                </div>

                {visaoFilterType === "mes" ? (
                  <div className="flex gap-2">
                    <Select value={visaoYear} onValueChange={setVisaoYear}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={visaoMonth} onValueChange={setVisaoMonth}>
                      <SelectTrigger className="w-28 sm:w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTHS_LIST.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input type="date" value={visaoStartDate} onChange={(e) => setVisaoStartDate(e.target.value)} className="w-36 sm:w-40" />
                    <span className="text-muted-foreground text-sm">até</span>
                    <Input type="date" value={visaoEndDate} onChange={(e) => setVisaoEndDate(e.target.value)} className="w-36 sm:w-40" />
                  </div>
                )}

                <Select value={visaoVendedor} onValueChange={setVisaoVendedor}>
                  <SelectTrigger className="w-32 sm:w-40"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos vendedores</SelectItem>
                    {vendedores?.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={visaoOrigem} onValueChange={setVisaoOrigem}>
                  <SelectTrigger className="w-28"><SelectValue placeholder="Origem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <Card>
                <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                  <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Qtd. Pedidos</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                  <div className="text-base sm:text-xl font-bold">{paidPedidos.length}</div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">pedidos pagos</p>
                </CardContent>
              </Card>
              {[
                { label: "Fat. Bruto", value: totalBruto },
                { label: "Fat. Líquido", value: totalLiquido },
                { label: "Frete", value: totalFrete },
                { label: "Taxas Pagar.me", value: totalTaxas },
                { label: "Comissões", value: totalComissoes },
              ].map(({ label, value }) => (
                <Card key={label}>
                  <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                    <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    <div className="text-base sm:text-xl font-bold">{formatCurrency(value)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader className="p-3 sm:p-6 pb-1 sm:pb-2">
                <CardTitle className="text-sm sm:text-base">Faturamento Mensal</CardTitle>
              </CardHeader>
              <CardContent className="h-48 sm:h-64 p-3 sm:p-6 pt-0 sm:pt-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={10} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: number, name: string) => {
                        if (name === "pedidos") return [v, "Pedidos"];
                        return [formatCurrency(v), "Faturamento"];
                      }}
                    />
                    <Bar dataKey="valor" fill="hsl(350, 45%, 65%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {tab === "comissoes" && (
          <>
            {/* Filters */}
            <Card className="p-3 sm:p-4">
              <div className="flex flex-wrap items-end gap-2 sm:gap-3">
                <div className="flex gap-2">
                  <Button variant={comFilterType === "mes" ? "default" : "outline"} size="sm" onClick={() => setComFilterType("mes")}>Por Mês</Button>
                  <Button variant={comFilterType === "custom" ? "default" : "outline"} size="sm" onClick={() => setComFilterType("custom")}>Personalizado</Button>
                </div>

                {comFilterType === "mes" ? (
                  <div className="flex gap-2">
                    <Select value={comYear} onValueChange={setComYear}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={comMonth} onValueChange={setComMonth}>
                      <SelectTrigger className="w-28 sm:w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{MONTHS_LIST.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input type="date" value={comStartDate} onChange={(e) => setComStartDate(e.target.value)} className="w-36 sm:w-40" />
                    <span className="text-muted-foreground text-sm">até</span>
                    <Input type="date" value={comEndDate} onChange={(e) => setComEndDate(e.target.value)} className="w-36 sm:w-40" />
                  </div>
                )}

                <Select value={comVendedor} onValueChange={setComVendedor}>
                  <SelectTrigger className="w-32 sm:w-40"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos vendedores</SelectItem>
                    {vendedores?.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* Saldo devedor de comissão — saldo corrido desde a data de corte,
                não mais por pedido individual. Não é filtrado por período,
                é sempre o saldo atual. */}
            <Card className="p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Saldo de Comissão por Vendedor</h3>
                </div>
                {corteComissao && (
                  <span className="text-[11px] text-muted-foreground">
                    Controle a partir de {format(getLocalDate(corteComissao), "dd/MM/yyyy")}
                  </span>
                )}
              </div>
              {!corteComissao ? (
                <p className="text-xs text-muted-foreground">Data de corte não configurada ainda.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {vendedores?.map((v) => {
                    const saldo = saldoPorVendedor[v.id] || { gerado: 0, pago: 0 };
                    if (saldo.gerado === 0 && saldo.pago === 0) return null;
                    const devedor = saldo.gerado - saldo.pago;
                    return (
                      <Card key={v.id} className="p-3 space-y-2 bg-muted/30">
                        <p className="text-sm font-medium">{v.nome}</p>
                        <div className="text-xs space-y-0.5 text-muted-foreground">
                          <p>Gerado: <span className="text-foreground font-medium">{formatCurrency(saldo.gerado)}</span></p>
                          <p>Pago: <span className="text-foreground font-medium">{formatCurrency(saldo.pago)}</span></p>
                        </div>
                        <p className="text-sm">
                          Saldo devedor:{" "}
                          <span className={cn("font-semibold", devedor > 0.009 ? "text-destructive" : "text-green-600")}>
                            {formatCurrency(devedor)}
                          </span>
                        </p>
                        <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => openPagamentoDialog(v.id)}>
                          <Plus className="h-3 w-3 mr-1" /> Registrar Pagamento
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Histórico de lançamentos */}
            <Card className="p-3 sm:p-4 space-y-2">
              <h3 className="font-semibold text-sm">Histórico de Pagamentos</h3>
              {!pagamentos || pagamentos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum pagamento lançado ainda.</p>
              ) : (
                <div className="space-y-1.5">
                  {pagamentos.map((pg) => {
                    const v = vendedores?.find((x) => x.id === pg.vendedor_id);
                    return (
                      <div key={pg.id} className="flex items-center justify-between gap-2 text-xs bg-muted/30 rounded-md px-2.5 py-1.5">
                        <div className="min-w-0">
                          <span className="font-medium">{formatCurrency(Number(pg.valor))}</span>
                          <span className="text-muted-foreground"> · {v?.nome || "—"} · {format(getLocalDate(pg.data_pagamento), "dd/MM/yyyy")}</span>
                          {pg.observacoes && <p className="text-muted-foreground truncate">{pg.observacoes}</p>}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive shrink-0"
                          onClick={() => setDeletePagamentoId(pg.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Summary totals (período filtrado) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: "Fat. Bruto", value: comTotalBruto },
                { label: "Frete / Correios", value: comTotalFrete },
                { label: "Taxas Pagar.me", value: comTotalTaxa },
                { label: "Taxa TED", value: comTotalTed },
                { label: "Fat. Líquido", value: comTotalLiquido },
                { label: "Total Comissões Geradas", value: comTotalComissao },
              ].map(({ label, value, color }) => (
                <Card key={label}>
                  <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                    <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">{label}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    <div className={cn("text-base sm:text-xl font-bold", color)}>{formatCurrency(value)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* TED grouping toolbar + summary */}
            {selectedTedPedidos.size > 0 ? (() => {
              const selected = comissoesTodas.filter(p => selectedTedPedidos.has(p.id));
              const sumBruto = selected.reduce((s, p) => s + Number(p.valor_bruto), 0);
              const sumFrete = selected.reduce((s, p) => s + Number(p.frete), 0);
              const sumTaxaPagarme = selected.reduce((s, p) => s + Number(p.taxa_pagarme), 0);
              const sumTedAtual = selected.reduce((s, p) => s + Number(p.taxa_ted), 0);
              const sumLiquido = selected.reduce((s, p) => s + Number(p.valor_liquido), 0);
              const sumComissao = selected.reduce((s, p) => s + Number(p.comissao), 0);
              const tedUnico = 3.67;
              const tedPerOrder = Math.round((tedUnico / selected.length) * 100) / 100;
              // Recalculate projected commission with single TED
              const projectedComissao = selected.reduce((s, p) => {
                const vendedor = vendedores?.find(v => v.id === p.vendedor_id);
                if (!vendedor) return s;
                const taxa = p.origem === "whatsapp" ? vendedor.taxa_comissao_whatsapp : vendedor.taxa_comissao_site;
                const base = Number(p.valor_bruto) - Number(p.frete) - Number(p.taxa_pagarme) - tedPerOrder;
                return s + (base > 0 ? base * (taxa / 100) : 0);
              }, 0);

              return (
                <Card className="p-4 border-primary/50 bg-accent/30">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Resumo — {selected.length} pedido(s) selecionado(s)</h3>
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedTedPedidos(new Set())}>
                        Limpar seleção
                      </Button>
                    </div>
                    <div className="text-xs space-y-1">
                      {selected.map(p => (
                        <span key={p.id} className="inline-flex items-center gap-1 mr-2 text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">#{p.numero_pedido}</Badge>
                          {p.cliente_nome}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Fat. Bruto:</span> <span className="font-medium">{formatCurrency(sumBruto)}</span></div>
                      <div><span className="text-muted-foreground">Frete:</span> <span className="font-medium">{formatCurrency(sumFrete)}</span></div>
                      <div><span className="text-muted-foreground">Pagar.me:</span> <span className="font-medium">{formatCurrency(sumTaxaPagarme)}</span></div>
                      <div><span className="text-muted-foreground">TED atual:</span> <span className="font-medium">{formatCurrency(sumTedAtual)}</span></div>
                      <div><span className="text-muted-foreground">Líquido:</span> <span className="font-medium">{formatCurrency(sumLiquido)}</span></div>
                      <div><span className="text-muted-foreground">Comissão atual:</span> <span className="font-medium">{formatCurrency(sumComissao)}</span></div>
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-muted-foreground">Com TED único (R$ {tedUnico.toFixed(2)} ÷ {selected.length} = R$ {tedPerOrder.toFixed(2)}/pedido):</span>
                        <span className="font-semibold text-primary">{formatCurrency(projectedComissao)}</span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" onClick={handleAgruparTed}>
                          <Link className="h-3 w-3 mr-1" />
                          Aplicar TED único
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const vendedorId = comVendedor !== "all" ? comVendedor : selected[0]?.vendedor_id || "";
                            openPagamentoDialog(vendedorId, projectedComissao);
                          }}
                        >
                          <Wallet className="h-3 w-3 mr-1" />
                          Registrar pagamento desse valor
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })() : (
              <div className="text-xs text-muted-foreground">
                Selecione pedidos para ver o resumo e agrupar TED / pagar comissões em lote
              </div>
            )}

            {/* Desktop table */}
            <Card className="overflow-hidden hidden sm:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Bruto</TableHead>
                      <TableHead className="text-right">Frete</TableHead>
                      <TableHead className="text-right">Pagar.me</TableHead>
                      <TableHead className="text-right">TED</TableHead>
                      <TableHead className="text-right">Líquido</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comissoesTodas.length === 0 ? (
                      <TableRow><TableCell colSpan={13} className="text-center py-8 text-muted-foreground">Nenhuma comissão encontrada</TableCell></TableRow>
                    ) : (
                      comissoesTodas.map((p) => {
                        const vendedorItem = vendedores?.find((v) => v.id === p.vendedor_id);
                        const isEditing = editingComissao === p.id;
                        const pct = getPercentual(p);
                        return (
                          <TableRow key={p.id} className={selectedTedPedidos.has(p.id) ? "bg-accent/50" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={selectedTedPedidos.has(p.id)}
                                onCheckedChange={() => toggleTedSelect(p.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">#{p.numero_pedido}</TableCell>
                            <TableCell className="text-xs">{format(new Date(p.data_pedido), "dd/MM/yy")}</TableCell>
                            <TableCell>{p.cliente_nome}</TableCell>
                            <TableCell>{vendedorItem?.nome || "—"}</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(Number(p.valor_bruto))}</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(Number(p.frete))}</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(Number(p.taxa_pagarme))}</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(Number(p.taxa_ted))}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{formatCurrency(Number(p.valor_liquido))}</TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="w-20 h-7 text-xs"
                                    onKeyDown={(e) => e.key === "Enter" && handleSaveComissao(p.id)}
                                    autoFocus
                                  />
                                  <span className="text-xs">%</span>
                                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleSaveComissao(p.id)}>
                                    <Check className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 justify-end">
                                  <span className="text-sm">{pct}%</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => {
                                      setEditingComissao(p.id);
                                      setEditValue(String(pct));
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(Number(p.comissao))}</TableCell>
                            <TableCell>{renderStatusComissao(p)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {comissoesTodas.map((p) => {
                const vendedorItem = vendedores?.find((v) => v.id === p.vendedor_id);
                const isEditing = editingComissao === p.id;
                const pct = getPercentual(p);
                return (
                  <Card key={p.id} className={cn("p-3 space-y-2", selectedTedPedidos.has(p.id) && "ring-2 ring-primary")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedTedPedidos.has(p.id)}
                          onCheckedChange={() => toggleTedSelect(p.id)}
                        />
                        <span className="font-medium text-sm">#{p.numero_pedido}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{p.cliente_nome} · {vendedorItem?.nome || "—"}</p>
                      {renderStatusComissao(p)}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Data: {format(new Date(p.data_pedido), "dd/MM/yyyy")}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Bruto: <span className="text-foreground font-medium">{formatCurrency(Number(p.valor_bruto))}</span></span>
                      <span>Frete: <span className="text-foreground font-medium">{formatCurrency(Number(p.frete))}</span></span>
                      <span>Pagar.me: <span className="text-foreground font-medium">{formatCurrency(Number(p.taxa_pagarme))}</span></span>
                      <span>TED: <span className="text-foreground font-medium">{formatCurrency(Number(p.taxa_ted))}</span></span>
                      <span className="col-span-2">Líquido: <span className="text-foreground font-medium">{formatCurrency(Number(p.valor_liquido))}</span></span>
                    </div>
                    <div className="flex items-center justify-between">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-16 h-7 text-xs"
                            onKeyDown={(e) => e.key === "Enter" && handleSaveComissao(p.id)}
                            autoFocus
                          />
                          <span className="text-xs">%</span>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleSaveComissao(p.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{formatCurrency(Number(p.comissao))}</span>
                          <span className="text-xs text-muted-foreground">({pct}%)</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              setEditingComissao(p.id);
                              setEditValue(String(pct));
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {tab === "pagarme" && (
          <>
            <div className="flex flex-wrap items-end gap-2 sm:gap-3">
              <div className="flex gap-2">
                <Button variant={pgFilterType === "mes" ? "default" : "outline"} size="sm" onClick={() => setPgFilterType("mes")}>Por Mês</Button>
                <Button variant={pgFilterType === "custom" ? "default" : "outline"} size="sm" onClick={() => setPgFilterType("custom")}>Personalizado</Button>
              </div>
              {pgFilterType === "mes" ? (
                <div className="flex gap-2">
                  <Select value={pgYear} onValueChange={setPgYear}>
                    <SelectTrigger className="w-24 sm:w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={pgMonth} onValueChange={setPgMonth}>
                    <SelectTrigger className="w-28 sm:w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input type="date" value={pgStartDate} onChange={(e) => setPgStartDate(e.target.value)} className="w-36 sm:w-40" />
                  <span className="text-muted-foreground text-sm">até</span>
                  <Input type="date" value={pgEndDate} onChange={(e) => setPgEndDate(e.target.value)} className="w-36 sm:w-40" />
                </div>
              )}
            </div>

            {pagarmeData?.summary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Card>
                  <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2"><CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Transações</CardTitle></CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0"><div className="text-base sm:text-xl font-bold">{pagarmeData.summary.count}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2"><CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Valor Bruto</CardTitle></CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0"><div className="text-base sm:text-xl font-bold">{formatCurrency(pagarmeData.summary.total_bruto)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2"><CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Taxas Pagar.me</CardTitle></CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0"><div className="text-base sm:text-xl font-bold text-destructive">{formatCurrency(pagarmeData.summary.total_taxas)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2"><CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Valor Líquido</CardTitle></CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0"><div className="text-base sm:text-xl font-bold text-primary">{formatCurrency(pagarmeData.summary.total_liquido)}</div></CardContent>
                </Card>
              </div>
            )}

            <Tabs value={pgSubTab} onValueChange={(v) => setPgSubTab(v as "pagos" | "pendentes")}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="pagos" className="flex-1 sm:flex-none">Pagos ({chargesPagos.length})</TabsTrigger>
                <TabsTrigger value="pendentes" className="flex-1 sm:flex-none">Pendentes ({chargesPendentes.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="pagos" className="mt-4">
                {pgLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Carregando extrato...</span>
                  </div>
                ) : depositGroups.length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhuma transação paga no período</CardContent></Card>
                ) : (
                  <div className="space-y-4">
                    {depositGroups.map(([depositDate, charges]) => {
                      const totalGrupo = charges.reduce((s, c) => s + c.paid_amount, 0);
                      const totalTaxaGrupo = charges.reduce((s, c) => s + c.gateway_fee, 0);
                      return (
                        <Card key={depositDate} className="overflow-hidden">
                          <CardHeader className="pb-2 bg-muted/30 p-3 sm:p-6 sm:pb-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <CardTitle className="text-xs sm:text-sm">Depósito: {depositDate}</CardTitle>
                              <div className="flex gap-3 text-[10px] sm:text-xs">
                                <span>Líquido: <strong>{formatCurrency(totalGrupo)}</strong></span>
                                <span className="text-destructive">Taxas: {formatCurrency(totalTaxaGrupo)}</span>
                              </div>
                            </div>
                          </CardHeader>
                          {/* Desktop */}
                          <div className="hidden sm:block overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Pedido</TableHead>
                                  <TableHead>Método</TableHead>
                                  <TableHead>Parcelas</TableHead>
                                  <TableHead className="text-right">Bruto</TableHead>
                                  <TableHead className="text-right">Taxa</TableHead>
                                  <TableHead className="text-right">Líquido</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {charges.map((c) => (
                                  <TableRow key={c.id}>
                                    <TableCell className="font-medium">{c.order_code || "—"}</TableCell>
                                    <TableCell className="text-sm capitalize">{c.payment_method}</TableCell>
                                    <TableCell className="text-sm">{c.installments}x</TableCell>
                                    <TableCell className="text-right text-sm">{formatCurrency(c.amount)}</TableCell>
                                    <TableCell className="text-right text-sm text-destructive">{formatCurrency(c.gateway_fee)}</TableCell>
                                    <TableCell className="text-right text-sm font-medium">{formatCurrency(c.paid_amount)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                          {/* Mobile */}
                          <div className="sm:hidden p-2 space-y-2">
                            {charges.map((c) => (
                              <div key={c.id} className="flex items-center justify-between p-2 rounded bg-muted/20 text-xs">
                                <div>
                                  <p className="font-medium">{c.order_code || "—"}</p>
                                  <p className="text-muted-foreground capitalize">{c.payment_method} · {c.installments}x</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-medium">{formatCurrency(c.paid_amount)}</p>
                                  <p className="text-destructive text-[10px]">-{formatCurrency(c.gateway_fee)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pendentes" className="mt-4">
                {pgLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Desktop */}
                    <Card className="overflow-hidden hidden sm:block">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Pedido</TableHead>
                              <TableHead>Método</TableHead>
                              <TableHead className="text-right">Bruto</TableHead>
                              <TableHead className="text-right">Taxa</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {chargesPendentes.length === 0 ? (
                              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma transação pendente</TableCell></TableRow>
                            ) : (
                              chargesPendentes.map((c) => (
                                <TableRow key={c.id}>
                                  <TableCell className="text-sm">{c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy") : "—"}</TableCell>
                                  <TableCell className="font-medium">{c.order_code || "—"}</TableCell>
                                  <TableCell className="text-sm capitalize">{c.payment_method}</TableCell>
                                  <TableCell className="text-right text-sm">{formatCurrency(c.amount)}</TableCell>
                                  <TableCell className="text-right text-sm text-destructive">{formatCurrency(c.gateway_fee)}</TableCell>
                                  <TableCell>
                                    <Badge variant="secondary" className="text-xs">{STATUS_MAP[c.status] || c.status}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>

                    {/* Mobile */}
                    <div className="sm:hidden space-y-2">
                      {chargesPendentes.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground text-sm">Nenhuma transação pendente</p>
                      ) : (
                        chargesPendentes.map((c) => (
                          <Card key={c.id} className="p-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{c.order_code || "—"}</span>
                              <Badge variant="secondary" className="text-[10px]">{STATUS_MAP[c.status] || c.status}</Badge>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                              <span className="capitalize">{c.payment_method}</span>
                              <span>{formatCurrency(c.amount)}</span>
                            </div>
                          </Card>
                        ))
                      )}
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Dialog open={pagamentoDialogOpen} onOpenChange={setPagamentoDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento de Comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Vendedor</Label>
              <Select value={pagamentoVendedorId} onValueChange={setPagamentoVendedorId}>
                <SelectTrigger><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                <SelectContent>
                  {vendedores?.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pagamentoValor">Valor (R$)</Label>
              <Input
                id="pagamentoValor"
                value={pagamentoValor}
                onChange={(e) => setPagamentoValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pagamentoData">Data do Pagamento</Label>
              <Input
                id="pagamentoData"
                type="date"
                value={pagamentoData}
                onChange={(e) => setPagamentoData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pagamentoObs">Observações (opcional)</Label>
              <Textarea
                id="pagamentoObs"
                value={pagamentoObs}
                onChange={(e) => setPagamentoObs(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagamentoDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => registrarPagamento.mutate()} disabled={registrarPagamento.isPending}>
              {registrarPagamento.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletePagamentoId} onOpenChange={(v) => !v && setDeletePagamentoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O saldo devedor volta a somar esse valor. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePagamentoId && excluirPagamento.mutate(deletePagamentoId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
