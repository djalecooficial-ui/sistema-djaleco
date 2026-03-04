import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidosComItens, useUpdatePedido, type PedidoComItens } from "@/hooks/usePedidos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { differenceInHours } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Phone, MapPin, Clock } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";

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

const DRAG_THRESHOLD = 10; // pixels to distinguish tap from drag

export default function Producao() {
  const { data: pedidos } = usePedidosComItens();
  const updatePedido = useUpdatePedido();
  const navigate = useNavigate();
  const [dragOverEtapa, setDragOverEtapa] = useState<string | null>(null);
  const [localPedidos, setLocalPedidos] = useState<PedidoComItens[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragItemRef = useRef<string | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (pedidos) setLocalPedidos(pedidos);
  }, [pedidos]);

  const pedidosByEtapa = ETAPAS.reduce(
    (acc, etapa) => {
      acc[etapa] = localPedidos.filter((p) => p.etapa_producao === etapa);
      return acc;
    },
    {} as Record<string, PedidoComItens[]>
  );

  const handleDrop = useCallback((pedidoId: string, novaEtapa: string) => {
    setDragOverEtapa(null);
    setDraggingId(null);
    const now = new Date().toISOString();

    setLocalPedidos((prev) =>
      prev.map((p) =>
        p.id === pedidoId ? { ...p, etapa_producao: novaEtapa, etapa_entrada_em: now } : p
      )
    );

    updatePedido.mutate(
      { id: pedidoId, etapa_producao: novaEtapa, etapa_entrada_em: now },
      {
        onSuccess: () => toast.success(`Movido para ${novaEtapa}`),
        onError: () => {
          toast.error("Erro ao mover pedido");
          if (pedidos) setLocalPedidos(pedidos);
        },
      }
    );
  }, [updatePedido, pedidos]);

  const handleTouchStart = useCallback((e: React.TouchEvent, pedidoId: string) => {
    e.preventDefault(); // Prevent link context menu
    dragItemRef.current = pedidoId;
    isDraggingRef.current = false;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragItemRef.current || !touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    
    if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      isDraggingRef.current = true;
      setDraggingId(dragItemRef.current);
    }

    if (isDraggingRef.current) {
      e.preventDefault();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const col = el?.closest("[data-etapa]");
      if (col) {
        setDragOverEtapa(col.getAttribute("data-etapa"));
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const startInfo = touchStartRef.current;
    const pedidoId = dragItemRef.current;

    if (pedidoId && isDraggingRef.current && dragOverEtapa) {
      // Was dragging → drop
      handleDrop(pedidoId, dragOverEtapa);
    } else if (pedidoId && startInfo && !isDraggingRef.current) {
      // Quick tap → navigate
      navigate(`/pedidos/${pedidoId}`);
    }

    dragItemRef.current = null;
    touchStartRef.current = null;
    isDraggingRef.current = false;
    setDraggingId(null);
    setDragOverEtapa(null);
  }, [dragOverEtapa, handleDrop, navigate]);

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Produção</h1>

        <Tabs defaultValue="kanban">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="kanban">Kanban</TabsTrigger>
            <TabsTrigger value="prazos">Prazos por Etapa</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-4">
            <div
              className="flex gap-2 sm:gap-3 overflow-x-auto pb-4 snap-x snap-mandatory"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {ETAPAS.map((etapa) => (
                <div
                  key={etapa}
                  data-etapa={etapa}
                  className={`min-w-[180px] sm:min-w-[220px] max-w-[180px] sm:max-w-[220px] flex-shrink-0 snap-start transition-colors rounded-lg ${
                    dragOverEtapa === etapa ? "ring-2 ring-primary/50 bg-accent/30" : ""
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
                    <CardHeader className="pb-2 px-2 sm:px-3 pt-2 sm:pt-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-[10px] sm:text-xs font-medium">{etapa}</CardTitle>
                        <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1 sm:px-1.5">
                          {pedidosByEtapa[etapa]?.length || 0}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1.5 sm:space-y-2 px-2 sm:px-3 pb-2 sm:pb-3 min-h-[120px] sm:min-h-[150px]">
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
                            onDragStart={(e) => {
                              e.dataTransfer.setData("pedidoId", p.id);
                              setDraggingId(p.id);
                            }}
                            onDragEnd={() => setDraggingId(null)}
                            onTouchStart={(e) => handleTouchStart(e, p.id)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            className={`p-1.5 sm:p-2 rounded-md border-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition-all text-[10px] sm:text-[11px] select-none ${colorClass} ${
                              draggingId === p.id ? "opacity-50 scale-95" : ""
                            }`}
                            style={{ touchAction: "none" }}
                          >
                            <div className="block space-y-0.5 sm:space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-primary">#{p.numero_pedido}</span>
                                <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0">{p.origem}</Badge>
                              </div>
                              <p className="font-medium truncate">{p.cliente_nome}</p>
                              {p.cliente_telefone && (
                                <p className="flex items-center gap-1 text-muted-foreground">
                                  <Phone className="h-2 w-2 sm:h-2.5 sm:w-2.5" />{p.cliente_telefone}
                                </p>
                              )}
                              {(p.cidade || p.estado) && (
                                <p className="flex items-center gap-1 text-muted-foreground">
                                  <MapPin className="h-2 w-2 sm:h-2.5 sm:w-2.5" />{[p.cidade, p.estado].filter(Boolean).join("/")}
                                </p>
                              )}
                              {itensStr && (
                                <p className="text-muted-foreground truncate" title={itensStr}>
                                  {itensStr}
                                </p>
                              )}
                              {timeStr && (
                                <p className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-2 w-2 sm:h-2.5 sm:w-2.5" />{timeStr} nesta etapa
                                </p>
                              )}
                            </div>
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
                <CardTitle className="text-sm sm:text-base">Prazos Estimados por Etapa</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead className="hidden sm:table-cell">Indicador</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(PRAZOS_ETAPA).map(([etapa, dias]) => (
                      <TableRow key={etapa}>
                        <TableCell className="font-medium">{etapa}</TableCell>
                        <TableCell>{dias} {dias === 1 ? "dia" : "dias"}</TableCell>
                        <TableCell className="hidden sm:table-cell">
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
