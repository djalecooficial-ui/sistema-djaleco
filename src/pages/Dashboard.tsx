import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { usePedidos } from "@/hooks/usePedidos";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ShoppingBag, DollarSign, TrendingUp, UserPlus, AlertTriangle, CheckCircle, Clock, CreditCard, Truck, Percent, Wallet, CalendarIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => currentYear - i);

type FilterMode = "month" | "custom";

export default function Dashboard() {
  const now = new Date();
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [selectedYear, setSelectedYear] = useState(now.getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth().toString());
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  let periodStart: Date;
  let periodEnd: Date;

  if (filterMode === "custom" && dateRange?.from && dateRange?.to) {
    periodStart = dateRange.from;
    periodEnd = dateRange.to;
  } else {
    periodStart = startOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth)));
    periodEnd = endOfMonth(new Date(parseInt(selectedYear), parseInt(selectedMonth)));
  }

  const { data: stats, isLoading } = useDashboardStats(periodStart, periodEnd);
  const { data: pedidos } = usePedidos();
  const recentPedidos = pedidos?.slice(0, 5) || [];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 sm:h-28 rounded-lg" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header with filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter mode toggle */}
            <div className="flex rounded-md border border-input overflow-hidden">
              <button
                onClick={() => setFilterMode("month")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  filterMode === "month" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                Mês
              </button>
              <button
                onClick={() => setFilterMode("custom")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  filterMode === "custom" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                Personalizado
              </button>
            </div>

            {filterMode === "month" ? (
              <>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[90px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("text-xs h-8 justify-start", !dateRange && "text-muted-foreground")}>
                    <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        `${format(dateRange.from, "dd/MM/yy")} - ${format(dateRange.to, "dd/MM/yy")}`
                      ) : format(dateRange.from, "dd/MM/yy")
                    ) : "Selecionar período"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Pedidos</CardTitle>
              <ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{stats?.totalPedidosMes || 0}</div>
              {stats?.variacaoPedidos !== 0 && (
                <p className={`text-[10px] sm:text-xs ${(stats?.variacaoPedidos || 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {(stats?.variacaoPedidos || 0) >= 0 ? "+" : ""}{stats?.variacaoPedidos}% vs anterior
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Fat. Bruto</CardTitle>
              <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(stats?.faturamentoBruto || 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Fat. Líquido</CardTitle>
              <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(stats?.faturamentoLiquido || 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Ticket Médio</CardTitle>
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(stats?.ticketMedio || 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Clientes Novos</CardTitle>
              <UserPlus className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{stats?.clientesNovos || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Financial section */}
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-muted-foreground mb-3">Financeiro</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="border-l-4 border-l-destructive">
              <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                <div className="flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-destructive" />
                  <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Taxas Pagar.me</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-base sm:text-xl font-bold text-destructive">{formatCurrency(stats?.totalTaxasPagarme || 0)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-400">
              <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                <div className="flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-orange-500" />
                  <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Frete / Correios</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-base sm:text-xl font-bold text-orange-600">{formatCurrency(stats?.totalFrete || 0)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-400">
              <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                <div className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-purple-500" />
                  <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Comissões</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-base sm:text-xl font-bold text-purple-600">{formatCurrency(stats?.totalComissoes || 0)}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-green-600" />
                  <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Lucro Operacional</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-base sm:text-xl font-bold text-green-600">{formatCurrency(stats?.lucroOperacional || 0)}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Production status */}
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-muted-foreground mb-3">Produção</h2>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Card className="border-l-4 border-l-blue-400">
              <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-blue-500" />
                  <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">No Prazo</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl sm:text-3xl font-bold text-blue-600">{stats?.producao.noPrazo || 0}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-400">
              <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-orange-500" />
                  <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Atenção</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl sm:text-3xl font-bold text-orange-600">{stats?.producao.atencao || 0}</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-400">
              <CardHeader className="pb-1 p-3 sm:p-6 sm:pb-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <CardTitle className="text-[11px] sm:text-sm font-medium text-muted-foreground">Atrasado</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                <div className="text-xl sm:text-3xl font-bold text-destructive">{stats?.producao.atrasado || 0}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent orders */}
        <Card>
          <CardHeader className="p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-sm sm:text-base">Últimos Pedidos</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            <div className="space-y-2 sm:space-y-3">
              {recentPedidos.map((p) => (
                <Link
                  key={p.id}
                  to={`/pedidos/${p.id}`}
                  className="flex items-center justify-between p-1.5 sm:p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-xs sm:text-sm">#{p.numero_pedido}</span>
                    <span className="text-muted-foreground text-xs sm:text-sm ml-2 truncate">{p.cliente_nome}</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <Badge variant="secondary" className="text-[10px] sm:text-xs hidden sm:inline-flex">{p.etapa_producao || "—"}</Badge>
                    <span className="text-xs sm:text-sm font-medium">{formatCurrency(Number(p.valor_bruto))}</span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
