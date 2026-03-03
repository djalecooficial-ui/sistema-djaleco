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
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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

// Group charges by paid_at date for deposit reconciliation
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

export default function Financeiro() {
  const { data: pedidos } = usePedidos();
  const { data: vendedores } = useVendedores();
  const updatePedido = useUpdatePedido();
  const [tab, setTab] = useState<"visao" | "comissoes" | "pagarme">("visao");

  // Pagarme filters
  const currentYear = new Date().getFullYear().toString();
  const currentMonth = (new Date().getMonth() + 1).toString();
  const [pgFilterType, setPgFilterType] = useState<"mes" | "custom">("mes");
  const [pgYear, setPgYear] = useState(currentYear);
  const [pgMonth, setPgMonth] = useState(currentMonth);
  const [pgStartDate, setPgStartDate] = useState("");
  const [pgEndDate, setPgEndDate] = useState("");
  const [pgSubTab, setPgSubTab] = useState<"pagos" | "pendentes">("pagos");

  const pagarmeParams = pgFilterType === "mes"
    ? { year: pgYear, month: pgMonth }
    : { start_date: pgStartDate, end_date: pgEndDate };

  const { data: pagarmeData, isLoading: pgLoading } = usePagarmeExtrato(pagarmeParams);

  const allPedidos = pedidos || [];
  const totalBruto = allPedidos.reduce((s, p) => s + Number(p.valor_bruto), 0);
  const totalLiquido = allPedidos.reduce((s, p) => s + Number(p.valor_liquido), 0);
  const totalFrete = allPedidos.reduce((s, p) => s + Number(p.frete), 0);
  const totalTaxas = allPedidos.reduce((s, p) => s + Number(p.taxa_pagarme), 0);
  const totalComissoes = allPedidos.reduce((s, p) => s + Number(p.comissao), 0);

  const revenueByMonth: Record<string, number> = {};
  const sixMonthsAgo = subMonths(new Date(), 6);
  allPedidos
    .filter((p) => new Date(p.data_pedido) >= sixMonthsAgo)
    .forEach((p) => {
      const key = format(new Date(p.data_pedido), "yyyy-MM");
      revenueByMonth[key] = (revenueByMonth[key] || 0) + Number(p.valor_bruto);
    });
  const chartData = Object.entries(revenueByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, valor]) => ({ name: format(new Date(month + "-01"), "MMM/yy", { locale: ptBR }), valor }));

  const comissoesPendentes = allPedidos.filter((p) => !p.comissao_paga && Number(p.comissao) > 0);

  const handlePagarComissao = (pedidoId: string) => {
    updatePedido.mutate(
      { id: pedidoId, comissao_paga: true, comissao_paga_em: new Date().toISOString() },
      { onSuccess: () => toast.success("Comissão marcada como paga!") }
    );
  };

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));
  const months = [
    { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" }, { value: "3", label: "Março" },
    { value: "4", label: "Abril" }, { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
    { value: "7", label: "Julho" }, { value: "8", label: "Agosto" }, { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" }, { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  // Separate pagarme charges
  const chargesPagos = pagarmeData?.charges?.filter((c) => c.status === "paid") || [];
  const chargesPendentes = pagarmeData?.charges?.filter((c) => c.status !== "paid") || [];
  const depositGroups = groupByDeposit(chargesPagos);

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>

        <div className="flex gap-2">
          <Button variant={tab === "visao" ? "default" : "outline"} size="sm" onClick={() => setTab("visao")}>Visão Geral</Button>
          <Button variant={tab === "comissoes" ? "default" : "outline"} size="sm" onClick={() => setTab("comissoes")}>Comissões</Button>
          <Button variant={tab === "pagarme" ? "default" : "outline"} size="sm" onClick={() => setTab("pagarme")}>Pagar.me</Button>
        </div>

        {tab === "visao" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: "Faturamento Bruto", value: totalBruto },
                { label: "Faturamento Líquido", value: totalLiquido },
                { label: "Total Frete", value: totalFrete },
                { label: "Total Taxas", value: totalTaxas },
                { label: "Total Comissões", value: totalComissoes },
              ].map(({ label, value }) => (
                <Card key={label}>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold">{formatCurrency(value)}</div></CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">Faturamento Mensal</CardTitle></CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {vendedores?.map((v) => {
                const pedidosVendedor = allPedidos.filter((p) => p.vendedor_id === v.id);
                const totalCom = pedidosVendedor.reduce((s, p) => s + Number(p.comissao), 0);
                const pendente = pedidosVendedor.filter((p) => !p.comissao_paga).reduce((s, p) => s + Number(p.comissao), 0);
                return (
                  <Card key={v.id}>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{v.nome} ({v.taxa_comissao}%)</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-sm space-y-1">
                        <p>Total: <span className="font-medium">{formatCurrency(totalCom)}</span></p>
                        <p>Pendente: <span className="font-medium text-destructive">{formatCurrency(pendente)}</span></p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoesPendentes.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Todas as comissões estão pagas!</TableCell></TableRow>
                  ) : (
                    comissoesPendentes.map((p) => {
                      const vendedorItem = vendedores?.find((v) => v.id === p.vendedor_id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">#{p.numero_pedido}</TableCell>
                          <TableCell>{p.cliente_nome}</TableCell>
                          <TableCell>{vendedorItem?.nome || "—"}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(Number(p.comissao))}</TableCell>
                          <TableCell><Badge variant="destructive" className="text-xs">Pendente</Badge></TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => handlePagarComissao(p.id)}>
                              <Check className="h-3 w-3 mr-1" />Pagar
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </>
        )}

        {tab === "pagarme" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex gap-2">
                <Button variant={pgFilterType === "mes" ? "default" : "outline"} size="sm" onClick={() => setPgFilterType("mes")}>Por Mês</Button>
                <Button variant={pgFilterType === "custom" ? "default" : "outline"} size="sm" onClick={() => setPgFilterType("custom")}>Personalizado</Button>
              </div>
              {pgFilterType === "mes" ? (
                <>
                  <Select value={pgYear} onValueChange={setPgYear}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={pgMonth} onValueChange={setPgMonth}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>{months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <Input type="date" value={pgStartDate} onChange={(e) => setPgStartDate(e.target.value)} className="w-40" />
                  <span className="text-muted-foreground">até</span>
                  <Input type="date" value={pgEndDate} onChange={(e) => setPgEndDate(e.target.value)} className="w-40" />
                </>
              )}
            </div>

            {/* Summary cards */}
            {pagarmeData?.summary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Transações</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold">{pagarmeData.summary.count}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Valor Bruto</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold">{formatCurrency(pagarmeData.summary.total_bruto)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Taxas Pagar.me</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold text-destructive">{formatCurrency(pagarmeData.summary.total_taxas)}</div></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Valor Líquido</CardTitle></CardHeader>
                  <CardContent><div className="text-xl font-bold text-primary">{formatCurrency(pagarmeData.summary.total_liquido)}</div></CardContent>
                </Card>
              </div>
            )}

            {/* Sub-tabs: Pagos / Pendentes */}
            <Tabs value={pgSubTab} onValueChange={(v) => setPgSubTab(v as "pagos" | "pendentes")}>
              <TabsList>
                <TabsTrigger value="pagos">Pagos ({chargesPagos.length})</TabsTrigger>
                <TabsTrigger value="pendentes">Pendentes ({chargesPendentes.length})</TabsTrigger>
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
                          <CardHeader className="pb-2 bg-muted/30">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm">Depósito: {depositDate}</CardTitle>
                              <div className="flex gap-4 text-xs">
                                <span>Líquido: <strong>{formatCurrency(totalGrupo)}</strong></span>
                                <span className="text-destructive">Taxas: {formatCurrency(totalTaxaGrupo)}</span>
                              </div>
                            </div>
                          </CardHeader>
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
                  <Card className="overflow-hidden">
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
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
}
