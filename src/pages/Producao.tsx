import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidosComItens, useUpdatePedido, type PedidoComItens } from "@/hooks/usePedidos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { differenceInHours } from "date-fns";
import { Link } from "react-router-dom";
import { Phone, MapPin, Clock } from "lucide-react";
import { useState } from "react";

const ETAPAS = ["Planejamento", "Corte", "Costura", "Acabamento", "Embalagem", "Despachado"];

const PRAZOS_ETAPA: Record<string, number> = {
  Corte: 4,
  Costura: 10,
  Acabamento: 2,
  Embalagem: 1,
  Despachado: 1,
};

function getCardColor(etapa: string, etapa_entrada_em: string | null): string {
  const prazo = PRAZOS_ETAPA[etapa];
  if (!prazo || !etapa_entrada_em) return "border-border";
  const horasPassadas = differenceInHours(new Date(), new Date(etapa_entrada_em));
  const percentual = (horasPassadas / (prazo * 24)) * 100;
  if (percentual >= 90) return "border-red-400 bg-red-50/50";
  if (percentual >= 50) return "border-orange-400 bg-orange-50/50";
  return "border-blue-300 bg-blue-50/50";
}

function formatTimeInStage(etapa_entrada_em: string | null) {
  if (!etapa_entrada_em) return null;
  const hours = differenceInHours(new Date(), new Date(etapa_entrada_em));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function Producao() {
  const { data: pedidos } = usePedidosComItens();
  const updatePedido = useUpdatePedido();
  const [dragOverEtapa, setDragOverEtapa] = useState<string | null>(null);

  const pedidosByEtapa = ETAPAS.reduce(
    (acc, etapa) => {
      acc[etapa] = pedidos?.filter((p) => p.etapa_producao === etapa) || [];
      return acc;
    },
    {} as Record<string, PedidoComItens[]>
  );

  const handleDrop = (pedidoId: string, novaEtapa: string) => {
    setDragOverEtapa(null);
    updatePedido.mutate(
      { id: pedidoId, etapa_producao: novaEtapa, etapa_entrada_em: new Date().toISOString() },
      { onSuccess: () => toast.success(`Movido para ${novaEtapa}`) }
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Produção</h1>

        <Tabs defaultValue="kanban">
          <TabsList>
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="prazos">Prazos por Etapa</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            <div className="flex gap-3 overflow-x-auto pb-4">
              {ETAPAS.map((etapa) => (
                <div
                  key={etapa}
                  className={`min-w-[220px] max-w-[220px] flex-shrink-0 transition-colors rounded-lg ${
                    dragOverEtapa === etapa ? "ring-2 ring-primary/50" : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverEtapa(etapa);
                  }}
                  onDragLeave={() => setDragOverEtapa(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const pedidoId = e.dataTransfer.getData("pedidoId");
                    if (pedidoId) handleDrop(pedidoId, etapa);
                  }}
                >
                  <Card className="h-full">
                    <CardHeader className="pb-2 px-3 pt-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xs font-medium">{etapa}</CardTitle>
                        <Badge variant="secondary" className="text-[10px] px-1.5">
                          {pedidosByEtapa[etapa]?.length || 0}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 px-3 pb-3 min-h-[150px]">
                      {pedidosByEtapa[etapa]?.map((p) => {
                        const colorClass = getCardColor(etapa, p.etapa_entrada_em);
                        const timeStr = formatTimeInStage(p.etapa_entrada_em);
                        const itens = p.pedido_itens || [];
                        const itensStr = itens
                          .map((i) => {
                            let s = `${i.quantidade}x ${i.nome_produto}`;
                            if (i.cor) s += ` ${i.cor}`;
                            if (i.tamanho) s += ` ${i.tamanho}`;
                            return s;
                          })
                          .join(", ");

                        return (
                          <div
                            key={p.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("pedidoId", p.id)}
                            className={`p-2 rounded-md border-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all text-[11px] ${colorClass}`}
                          >
                            <Link to={`/pedidos/${p.id}`} className="block space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-primary">#{p.numero_pedido}</span>
                                <Badge variant="outline" className="text-[9px] px-1 py-0">{p.origem}</Badge>
                              </div>
                              <p className="font-medium truncate">{p.cliente_nome}</p>
                              {p.cliente_telefone && (
                                <p className="flex items-center gap-1 text-muted-foreground">
                                  <Phone className="h-2.5 w-2.5" />{p.cliente_telefone}
                                </p>
                              )}
                              {(p.cidade || p.estado) && (
                                <p className="flex items-center gap-1 text-muted-foreground">
                                  <MapPin className="h-2.5 w-2.5" />{[p.cidade, p.estado].filter(Boolean).join("/")}
                                </p>
                              )}
                              {itensStr && (
                                <p className="text-muted-foreground truncate" title={itensStr}>
                                  {itensStr}
                                </p>
                              )}
                              {timeStr && (
                                <p className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5" />{timeStr} nesta etapa
                                </p>
                              )}
                            </Link>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="prazos" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Prazos Estimados por Etapa</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Indicador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(PRAZOS_ETAPA).map(([etapa, dias]) => (
                      <TableRow key={etapa}>
                        <TableCell className="font-medium">{etapa}</TableCell>
                        <TableCell>{dias} {dias === 1 ? "dia" : "dias"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Badge className="bg-blue-100 text-blue-700 text-[10px]">&lt;50% azul</Badge>
                            <Badge className="bg-orange-100 text-orange-700 text-[10px]">50-89% laranja</Badge>
                            <Badge className="bg-red-100 text-red-700 text-[10px]">≥90% vermelho</Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
