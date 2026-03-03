import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidos, useUpdatePedido } from "@/hooks/usePedidos";
import { useVendedores } from "@/hooks/useVendedores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Check } from "lucide-react";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function Financeiro() {
  const { data: pedidos } = usePedidos();
  const { data: vendedores } = useVendedores();
  const updatePedido = useUpdatePedido();
  const [tab, setTab] = useState<"visao" | "comissoes">("visao");

  const allPedidos = pedidos || [];
  const totalBruto = allPedidos.reduce((s, p) => s + Number(p.valor_bruto), 0);
  const totalLiquido = allPedidos.reduce((s, p) => s + Number(p.valor_liquido), 0);
  const totalFrete = allPedidos.reduce((s, p) => s + Number(p.frete), 0);
  const totalTaxas = allPedidos.reduce((s, p) => s + Number(p.taxa_pagarme), 0);
  const totalComissoes = allPedidos.reduce((s, p) => s + Number(p.comissao), 0);

  // Revenue chart
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

  // Comissoes pendentes
  const comissoesPendentes = allPedidos.filter((p) => !p.comissao_paga && Number(p.comissao) > 0);

  const handlePagarComissao = (pedidoId: string) => {
    updatePedido.mutate(
      { id: pedidoId, comissao_paga: true, comissao_paga_em: new Date().toISOString() },
      { onSuccess: () => toast.success("Comissão marcada como paga!") }
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>

        {/* Tabs */}
        <div className="flex gap-2">
          <Button variant={tab === "visao" ? "default" : "outline"} size="sm" onClick={() => setTab("visao")}>Visão Geral</Button>
          <Button variant={tab === "comissoes" ? "default" : "outline"} size="sm" onClick={() => setTab("comissoes")}>Comissões</Button>
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
                    <Bar dataKey="valor" fill="hsl(210, 80%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {tab === "comissoes" && (
          <>
            {/* Resumo por vendedor */}
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
                      const vendedor = vendedores?.find((v) => v.id === p.vendedor_id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">#{p.numero_pedido}</TableCell>
                          <TableCell>{p.cliente_nome}</TableCell>
                          <TableCell>{vendedor?.nome || "—"}</TableCell>
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
      </div>
    </AppLayout>
  );
}
