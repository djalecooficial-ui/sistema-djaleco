import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidosComItens } from "@/hooks/usePedidos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { useState, useMemo } from "react";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { MapPin, TrendingUp, Truck, Package, ShoppingBag } from "lucide-react";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const COLORS = [
  "hsl(350, 45%, 65%)",
  "hsl(350, 45%, 50%)",
  "hsl(350, 45%, 75%)",
  "hsl(30, 60%, 55%)",
  "hsl(200, 50%, 55%)",
  "hsl(150, 40%, 50%)",
  "hsl(270, 40%, 60%)",
  "hsl(45, 70%, 55%)",
  "hsl(0, 50%, 55%)",
  "hsl(180, 40%, 50%)",
];

type PeriodFilter = "3m" | "6m" | "12m" | "all";

export default function Relatorios() {
  const { data: pedidos = [] } = usePedidosComItens();
  const [period, setPeriod] = useState<PeriodFilter>("6m");
  const isMobile = useIsMobile();

  const paidPedidos = useMemo(() => {
    const now = new Date();
    let cutoff: Date | null = null;
    if (period === "3m") cutoff = subMonths(now, 3);
    else if (period === "6m") cutoff = subMonths(now, 6);
    else if (period === "12m") cutoff = subMonths(now, 12);

    return pedidos.filter((p) => {
      if (p.status_pagamento === "pendente") return false;
      if (cutoff) {
        const match = p.data_pedido?.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const d = match
          ? new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12)
          : new Date(p.data_pedido);
        if (d < cutoff) return false;
      }
      return true;
    });
  }, [pedidos, period]);

  // By state
  const byState = useMemo(() => {
    const map: Record<string, { pedidos: number; receita: number; frete: number }> = {};
    paidPedidos.forEach((p) => {
      const estado = p.estado || "Não informado";
      if (!map[estado]) map[estado] = { pedidos: 0, receita: 0, frete: 0 };
      map[estado].pedidos++;
      map[estado].receita += Number(p.valor_bruto);
      map[estado].frete += Number(p.frete);
    });
    return Object.entries(map)
      .map(([estado, v]) => ({ estado, ...v, ticketMedio: v.receita / v.pedidos, freteMedio: v.frete / v.pedidos }))
      .sort((a, b) => b.receita - a.receita);
  }, [paidPedidos]);

  // By city
  const byCity = useMemo(() => {
    const map: Record<string, { pedidos: number; receita: number; frete: number; estado: string }> = {};
    paidPedidos.forEach((p) => {
      const cidade = p.cidade || "Não informado";
      if (!map[cidade]) map[cidade] = { pedidos: 0, receita: 0, frete: 0, estado: p.estado || "" };
      map[cidade].pedidos++;
      map[cidade].receita += Number(p.valor_bruto);
      map[cidade].frete += Number(p.frete);
    });
    return Object.entries(map)
      .map(([cidade, v]) => ({ cidade, ...v, ticketMedio: v.receita / v.pedidos, freteMedio: v.frete / v.pedidos }))
      .sort((a, b) => b.receita - a.receita);
  }, [paidPedidos]);

  // By origin
  const byOrigin = useMemo(() => {
    const map: Record<string, { pedidos: number; receita: number }> = {};
    paidPedidos.forEach((p) => {
      const origem = p.origem === "whatsapp" ? "WhatsApp" : "Site";
      if (!map[origem]) map[origem] = { pedidos: 0, receita: 0 };
      map[origem].pedidos++;
      map[origem].receita += Number(p.valor_bruto);
    });
    return Object.entries(map)
      .map(([origem, v]) => ({ origem, ...v }))
      .sort((a, b) => b.receita - a.receita);
  }, [paidPedidos]);

  // By product (only paid orders)
  const byProduct = useMemo(() => {
    const map: Record<string, { quantidade: number; receita: number; pedidos: number }> = {};
    paidPedidos.forEach((p) => {
      (p.pedido_itens || []).forEach((item) => {
        const nome = item.nome_produto || "Não informado";
        if (!map[nome]) map[nome] = { quantidade: 0, receita: 0, pedidos: 0 };
        map[nome].quantidade += Number(item.quantidade) || 0;
        map[nome].receita += (Number(item.quantidade) || 0) * (Number(item.preco_unitario) || 0);
        map[nome].pedidos++;
      });
    });
    return Object.entries(map)
      .map(([produto, v]) => ({ produto, ...v }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [paidPedidos]);

  const topProductsChart = byProduct.slice(0, 10);

  // Freight analysis
  const freightStats = useMemo(() => {
    const totalFrete = paidPedidos.reduce((s, p) => s + Number(p.frete), 0);
    const totalReceita = paidPedidos.reduce((s, p) => s + Number(p.valor_bruto), 0);
    const freteGratis = paidPedidos.filter((p) => Number(p.frete) === 0).length;
    const fretePago = paidPedidos.length - freteGratis;
    const freteMedio = paidPedidos.length > 0 ? totalFrete / paidPedidos.length : 0;
    const percentFrete = totalReceita > 0 ? (totalFrete / totalReceita) * 100 : 0;
    return { totalFrete, freteMedio, freteGratis, fretePago, percentFrete };
  }, [paidPedidos]);

  const topStatesChart = byState.slice(0, 8);
  const topCitiesChart = byCity.slice(0, 10);

  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Relatórios de Vendas</h1>
            <p className="text-sm text-muted-foreground">
              Análise geográfica, frete e origem dos pedidos pagos
            </p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
              <SelectItem value="6m">Últimos 6 meses</SelectItem>
              <SelectItem value="12m">Últimos 12 meses</SelectItem>
              <SelectItem value="all">Todo período</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Pedidos Pagos</p>
              </div>
              <p className="text-xl font-bold">{paidPedidos.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Receita Total</p>
              </div>
              <p className="text-lg font-bold">{formatCurrency(paidPedidos.reduce((s, p) => s + Number(p.valor_bruto), 0))}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Frete Total</p>
              </div>
              <p className="text-lg font-bold">{formatCurrency(freightStats.totalFrete)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Estados Atendidos</p>
              </div>
              <p className="text-xl font-bold">{byState.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Freight Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumo de Frete</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Frete Médio</p>
                <p className="font-semibold text-lg">{formatCurrency(freightStats.freteMedio)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">% sobre Receita</p>
                <p className="font-semibold text-lg">{freightStats.percentFrete.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Com Frete Grátis</p>
                <p className="font-semibold text-lg">{freightStats.freteGratis}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Com Frete Pago</p>
                <p className="font-semibold text-lg">{freightStats.fretePago}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Products Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Produtos Mais Vendidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={topProductsChart} layout="vertical" margin={{ left: isMobile ? 90 : 160 }}>
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="produto" width={isMobile ? 85 : 155} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number, name: string) => (name === "Receita" ? formatCurrency(v) : v)}
                />
                <Bar dataKey="quantidade" name="Unidades" fill="hsl(350, 45%, 65%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Product Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalhamento por Produto</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Unidades Vendidas</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byProduct.map((row) => (
                    <TableRow key={row.produto}>
                      <TableCell className="font-medium">{row.produto}</TableCell>
                      <TableCell className="text-right">{row.quantidade}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.receita)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Charts Row */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Top States Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Receita por Estado</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topStatesChart} layout="vertical" margin={{ left: isMobile ? 60 : 80 }}>
                  <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="estado" width={isMobile ? 55 : 75} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="receita" name="Receita" fill="hsl(350, 45%, 65%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Origin Pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Vendas por Origem</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={byOrigin}
                    dataKey="receita"
                    nameKey="origem"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ origem, percent }) => `${origem} ${(percent * 100).toFixed(0)}%`}
                  >
                    {byOrigin.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Cities Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 Cidades por Receita</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={topCitiesChart} layout="vertical" margin={{ left: isMobile ? 80 : 120 }}>
                <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="cidade" width={isMobile ? 75 : 115} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="receita" name="Receita" fill="hsl(350, 45%, 50%)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="frete" name="Frete" fill="hsl(30, 60%, 55%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* State Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalhamento por Estado</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Frete Total</TableHead>
                    <TableHead className="text-right">Ticket Médio</TableHead>
                    <TableHead className="text-right">Frete Médio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byState.map((row) => (
                    <TableRow key={row.estado}>
                      <TableCell className="font-medium">{row.estado}</TableCell>
                      <TableCell className="text-right">{row.pedidos}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.receita)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.frete)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ticketMedio)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.freteMedio)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* City Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Detalhamento por Cidade</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cidade</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Frete Total</TableHead>
                    <TableHead className="text-right">Ticket Médio</TableHead>
                    <TableHead className="text-right">Frete Médio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCity.map((row) => (
                    <TableRow key={row.cidade + row.estado}>
                      <TableCell className="font-medium">{row.cidade}</TableCell>
                      <TableCell>{row.estado}</TableCell>
                      <TableCell className="text-right">{row.pedidos}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.receita)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.frete)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.ticketMedio)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.freteMedio)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}