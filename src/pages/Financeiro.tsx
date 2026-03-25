import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidos, useUpdatePedido } from "@/hooks/usePedidos";
import { useVendedores } from "@/hooks/useVendedores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useState, useMemo } from "react";
import { format, subMonths, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Check, Loader2, CalendarIcon, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

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
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/pagarme-extrato?${query.toString()}`,
        { headers: { "Content-Type": "application/json" } }
      );
      if (!res.ok) throw new Error("Falha ao carregar extrato Pagar.me");
      return res.json() as Promise<{ charges: PagarmeCharge[]; summary: { total_bruto: number; total_liquido: number; total_taxas: number; count: number } }>;
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
  const [tab, setTab] = useState<"visao" | "comissoes" | "pagarme">("visao");

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

  const pagarmeParams = pgFilterType === "mes"
    ? { year: pgYear, month: pgMonth }
    : { start_date: pgStartDate, end_date: pgEndDate };

  const { data: pagarmeData, isLoading: pgLoading } = usePagarmeExtrato(pagarmeParams);

  const allPedidos = pedidos || [];

  // Filtered pedidos for Visão Geral
  const filteredPedidos = useMemo(() => {
    let filtered = [...allPedidos];

    if (visaoFilterType === "mes") {
      // Filter by year
      filtered = filtered.filter(p => {
        const d = new Date(p.data_pedido);
        return d.getFullYear().toString() === visaoYear;
      });
      // Filter by month if not "all"
      if (visaoMonth !== "all") {
        filtered = filtered.filter(p => {
          const d = new Date(p.data_pedido);
          return (d.getMonth() + 1).toString() === visaoMonth;
        });
      }
    } else {
      // Custom date range
      if (visaoStartDate) {
        const start = new Date(visaoStartDate);
        filtered = filtered.filter(p => new Date(p.data_pedido) >= start);
      }
      if (visaoEndDate) {
        const end = new Date(visaoEndDate + "T23:59:59");
        filtered = filtered.filter(p => new Date(p.data_pedido) <= end);
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

  const totalBruto = filteredPedidos.reduce((s, p) => s + Number(p.valor_bruto), 0);
  const totalLiquido = filteredPedidos.reduce((s, p) => s + Number(p.valor_liquido), 0);
  const totalFrete = filteredPedidos.reduce((s, p) => s + Number(p.frete), 0);
  const totalTaxas = filteredPedidos.reduce((s, p) => s + Number(p.taxa_pagarme), 0);
  const totalComissoes = filteredPedidos.filter(p => p.status_pagamento !== "pendente").reduce((s, p) => s + Number(p.comissao), 0);

  const revenueByMonth: Record<string, number> = {};
  filteredPedidos.forEach((p) => {
    const key = format(new Date(p.data_pedido), "yyyy-MM");
    revenueByMonth[key] = (revenueByMonth[key] || 0) + Number(p.valor_bruto);
  });
  const chartData = Object.entries(revenueByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, valor]) => ({ name: format(new Date(month + "-01"), "MMM/yy", { locale: ptBR }), valor }));

  // All pedidos with comissao (exclude unpaid/pending), filtered by period
  const comissoesTodas = useMemo(() => {
    let filtered = allPedidos.filter((p) => Number(p.comissao) > 0 && p.status_pagamento !== "pendente");

    if (comFilterType === "mes") {
      filtered = filtered.filter(p => new Date(p.data_pedido).getFullYear().toString() === comYear);
      if (comMonth !== "all") {
        filtered = filtered.filter(p => (new Date(p.data_pedido).getMonth() + 1).toString() === comMonth);
      }
    } else {
      if (comStartDate) filtered = filtered.filter(p => new Date(p.data_pedido) >= new Date(comStartDate));
      if (comEndDate) filtered = filtered.filter(p => new Date(p.data_pedido) <= new Date(comEndDate + "T23:59:59"));
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
  const comTotalLiquido = comissoesTodas.reduce((s, p) => s + Number(p.valor_liquido), 0);
  const comTotalComissao = comissoesTodas.reduce((s, p) => s + Number(p.comissao), 0);
  const comTotalPago = comissoesTodas.filter(p => p.comissao_paga).reduce((s, p) => s + Number(p.comissao), 0);
  const comTotalPendente = comissoesTodas.filter(p => !p.comissao_paga).reduce((s, p) => s + Number(p.comissao), 0);

  const handlePagarComissao = (pedidoId: string, date: Date) => {
    updatePedido.mutate(
      { id: pedidoId, comissao_paga: true, comissao_paga_em: date.toISOString() },
      { onSuccess: () => toast.success("Comissão marcada como paga!") }
    );
  };

  const handleDesmarcarComissao = (pedidoId: string) => {
    updatePedido.mutate(
      { id: pedidoId, comissao_paga: false, comissao_paga_em: null },
      { onSuccess: () => toast.success("Comissão revertida para pendente!") }
    );
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

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
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
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
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

            {/* Summary totals */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: "Fat. Bruto", value: comTotalBruto },
                { label: "Frete / Correios", value: comTotalFrete },
                { label: "Taxas Pagar.me", value: comTotalTaxa },
                { label: "Fat. Líquido", value: comTotalLiquido },
                { label: "Total Comissões", value: comTotalComissao },
                { label: "Comissões Pagas", value: comTotalPago, color: "text-green-600" },
                { label: "Comissões Pendentes", value: comTotalPendente, color: "text-destructive" },
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

            {/* Vendor cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {vendedores?.filter(v => comVendedor === "all" || v.id === comVendedor).map((v) => {
                const pedidosVendedor = comissoesTodas.filter((p) => p.vendedor_id === v.id);
                const totalCom = pedidosVendedor.reduce((s, p) => s + Number(p.comissao), 0);
                const pendente = pedidosVendedor.filter((p) => !p.comissao_paga).reduce((s, p) => s + Number(p.comissao), 0);
                if (totalCom === 0) return null;
                return (
                  <Card key={v.id}>
                    <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                      <CardTitle className="text-xs sm:text-sm">{v.nome} ({v.taxa_comissao}%)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                      <div className="text-xs sm:text-sm space-y-1">
                        <p>Total: <span className="font-medium">{formatCurrency(totalCom)}</span></p>
                        <p>Pendente: <span className="font-medium text-destructive">{formatCurrency(pendente)}</span></p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Desktop table */}
            <Card className="overflow-hidden hidden sm:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vendedor</TableHead>
                      <TableHead className="text-right">Bruto</TableHead>
                      <TableHead className="text-right">Frete</TableHead>
                      <TableHead className="text-right">Pagar.me</TableHead>
                      <TableHead className="text-right">Líquido</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data Pagamento</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comissoesTodas.length === 0 ? (
                      <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Nenhuma comissão encontrada</TableCell></TableRow>
                    ) : (
                      comissoesTodas.map((p) => {
                        const vendedorItem = vendedores?.find((v) => v.id === p.vendedor_id);
                        const isEditing = editingComissao === p.id;
                        const pct = getPercentual(p);
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">#{p.numero_pedido}</TableCell>
                            <TableCell>{p.cliente_nome}</TableCell>
                            <TableCell>{vendedorItem?.nome || "—"}</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(Number(p.valor_bruto))}</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(Number(p.frete))}</TableCell>
                            <TableCell className="text-right text-xs">{formatCurrency(Number(p.taxa_pagarme))}</TableCell>
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
                            <TableCell>
                              <Badge variant={p.comissao_paga ? "secondary" : "destructive"} className="text-xs cursor-pointer"
                                onClick={() => p.comissao_paga ? handleDesmarcarComissao(p.id) : undefined}
                                title={p.comissao_paga ? "Clique para reverter" : ""}
                              >
                                {p.comissao_paga ? "Pago" : "Pendente"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.comissao_paga_em ? format(new Date(p.comissao_paga_em), "dd/MM/yyyy") : "—"}
                            </TableCell>
                            <TableCell>
                              {!p.comissao_paga ? (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-7 text-xs">
                                      <CalendarIcon className="h-3 w-3 mr-1" />Pagar
                                    </Button>
                                  </PopoverTrigger>
                                   <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      onSelect={(d) => d && handlePagarComissao(p.id, d)}
                                      initialFocus
                                      className={cn("p-3 pointer-events-auto")}
                                    />
                                    <div className="p-2 border-t">
                                      <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => handlePagarComissao(p.id, new Date())}>
                                        Hoje
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => handleDesmarcarComissao(p.id)}>
                                  Reverter
                                </Button>
                              )}
                            </TableCell>
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
                  <Card key={p.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">#{p.numero_pedido}</span>
                      <Badge variant={p.comissao_paga ? "secondary" : "destructive"} className="text-[10px] cursor-pointer"
                        onClick={() => p.comissao_paga ? handleDesmarcarComissao(p.id) : undefined}
                      >
                        {p.comissao_paga ? "Pago ✕" : "Pendente"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{p.cliente_nome} · {vendedorItem?.nome || "—"}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                      <span>Bruto: <span className="text-foreground font-medium">{formatCurrency(Number(p.valor_bruto))}</span></span>
                      <span>Frete: <span className="text-foreground font-medium">{formatCurrency(Number(p.frete))}</span></span>
                      <span>Pagar.me: <span className="text-foreground font-medium">{formatCurrency(Number(p.taxa_pagarme))}</span></span>
                      <span>Líquido: <span className="text-foreground font-medium">{formatCurrency(Number(p.valor_liquido))}</span></span>
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
                      {!isEditing && (
                        !p.comissao_paga ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 text-xs">
                                <CalendarIcon className="h-3 w-3 mr-1" />Pagar
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <Calendar
                                mode="single"
                                onSelect={(d) => d && handlePagarComissao(p.id, d)}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                              <div className="p-2 border-t">
                                <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => handlePagarComissao(p.id, new Date())}>
                                  Hoje
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => handleDesmarcarComissao(p.id)}>
                            Reverter
                          </Button>
                        )
                      )}
                    </div>
                    {p.comissao_paga_em && (
                      <p className="text-[10px] text-muted-foreground">Pago em: {format(new Date(p.comissao_paga_em), "dd/MM/yyyy")}</p>
                    )}
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
    </AppLayout>
  );
}
