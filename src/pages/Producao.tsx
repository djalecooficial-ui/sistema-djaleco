import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidos, useUpdatePedido } from "@/hooks/usePedidos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { differenceInHours } from "date-fns";
import { Link } from "react-router-dom";

const ETAPAS = ["Planejamento", "Corte", "Costura", "Acabamento", "Embalagem", "Despachado"];

export default function Producao() {
  const { data: pedidos } = usePedidos();
  const updatePedido = useUpdatePedido();

  const pedidosByEtapa = ETAPAS.reduce(
    (acc, etapa) => {
      acc[etapa] = pedidos?.filter((p) => p.etapa_producao === etapa) || [];
      return acc;
    },
    {} as Record<string, typeof pedidos>
  );

  const handleDrop = (pedidoId: string, novaEtapa: string) => {
    updatePedido.mutate(
      { id: pedidoId, etapa_producao: novaEtapa, etapa_entrada_em: new Date().toISOString() },
      { onSuccess: () => toast.success(`Movido para ${novaEtapa}`) }
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Produção</h1>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {ETAPAS.map((etapa) => (
            <div
              key={etapa}
              className="min-w-[260px] flex-shrink-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const pedidoId = e.dataTransfer.getData("pedidoId");
                if (pedidoId) handleDrop(pedidoId, etapa);
              }}
            >
              <Card className="h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{etapa}</CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {pedidosByEtapa[etapa]?.length || 0}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 min-h-[200px]">
                  {pedidosByEtapa[etapa]?.map((p) => {
                    const horasNaEtapa = p.etapa_entrada_em
                      ? differenceInHours(new Date(), new Date(p.etapa_entrada_em))
                      : null;
                    return (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("pedidoId", p.id)}
                        className="p-3 rounded-md border bg-card cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                      >
                        <Link to={`/pedidos/${p.id}`} className="block">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm text-primary">#{p.numero_pedido}</span>
                            <Badge variant="outline" className="text-xs">{p.origem}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{p.cliente_nome}</p>
                          {horasNaEtapa !== null && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {horasNaEtapa < 24
                                ? `${horasNaEtapa}h nesta etapa`
                                : `${Math.floor(horasNaEtapa / 24)}d nesta etapa`}
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
      </div>
    </AppLayout>
  );
}
