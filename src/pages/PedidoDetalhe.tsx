import { AppLayout } from "@/components/layout/AppLayout";
import { usePedido, usePedidoItens, useUpdatePedido } from "@/hooks/usePedidos";
import { useVendedores } from "@/hooks/useVendedores";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Truck, PackageCheck } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const ETAPAS = ["Planejamento", "Corte", "Costura", "Acabamento", "Embalagem", "Despachado", "Entregue"];

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function PedidoDetalhe() {
  const { id } = useParams();
  const { data: pedido, isLoading } = usePedido(id);
  const { data: itens } = usePedidoItens(id);
  const { data: vendedores } = useVendedores();
  const updatePedido = useUpdatePedido();
  const queryClient = useQueryClient();
  const [trackingLoading, setTrackingLoading] = useState(false);

  const vendedor = vendedores?.find((v) => v.id === pedido?.vendedor_id);

  const handleVendedorChange = (vendedorId: string) => {
    if (!id) return;
    const v = vendedores?.find((vd) => vd.id === vendedorId);
    if (!v) return;
    const base = Number(pedido?.valor_bruto || 0) - Number(pedido?.taxa_pagarme || 0) - Number(pedido?.frete || 0);
    const comissao = base > 0 ? base * (v.taxa_comissao / 100) : 0;
    updatePedido.mutate(
      { id, vendedor_id: vendedorId, comissao },
      { onSuccess: () => toast.success("Vendedor atualizado!") }
    );
  };

  const handleEtapaChange = (etapa: string) => {
    if (!id) return;
    updatePedido.mutate(
      { id, etapa_producao: etapa, etapa_entrada_em: new Date().toISOString() },
      { onSuccess: () => toast.success("Etapa atualizada!") }
    );
  };

  const handleConsultarRastreio = async () => {
    if (!id) return;
    setTrackingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("superfrete-tracking", {
        body: { pedido_id: id },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success("Rastreio consultado com sucesso!");
        queryClient.invalidateQueries({ queryKey: ["pedidos", id] });
      }
    } catch (e: any) {
      toast.error("Erro ao consultar rastreio: " + (e.message || "erro"));
    } finally {
      setTrackingLoading(false);
    }
  };

  if (isLoading) {
    return <AppLayout><div className="p-8 text-muted-foreground">Carregando...</div></AppLayout>;
  }

  if (!pedido) {
    return <AppLayout><div className="p-8 text-muted-foreground">Pedido não encontrado</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/pedidos"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Pedido #{pedido.numero_pedido}</h1>
          <Badge variant="secondary">{pedido.etapa_producao || "Sem etapa"}</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Info principal */}
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Informações do Pedido</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-muted-foreground">Cliente</dt><dd className="font-medium">{pedido.cliente_nome}</dd></div>
                <div><dt className="text-muted-foreground">Telefone</dt><dd>{pedido.cliente_telefone || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Cidade/Estado</dt><dd>{[pedido.cidade, pedido.estado].filter(Boolean).join("/") || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Origem</dt><dd><Badge variant="outline">{pedido.origem}</Badge></dd></div>
                <div><dt className="text-muted-foreground">Data do Pedido</dt><dd>{format(new Date(pedido.data_pedido), "dd/MM/yyyy")}</dd></div>
                <div>
                  <dt className="text-muted-foreground mb-1">Vendedor</dt>
                  <Select value={pedido.vendedor_id || ""} onValueChange={handleVendedorChange}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Selecionar vendedor" /></SelectTrigger>
                    <SelectContent>
                      {vendedores?.map((v) => <SelectItem key={v.id} value={v.id}>{v.nome} ({v.taxa_comissao}%)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Etapa de Produção</dt>
                  <Select value={pedido.etapa_producao || ""} onValueChange={handleEtapaChange}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </dl>

              {/* Observações */}
              {pedido.observacoes_pedido && (
                <div className="mt-4 p-3 bg-muted/50 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm">{pedido.observacoes_pedido}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Valores */}
          <Card>
            <CardHeader><CardTitle className="text-base">Valores</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Valor Bruto</dt><dd className="font-medium">{formatCurrency(Number(pedido.valor_bruto))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Frete</dt><dd>{formatCurrency(Number(pedido.frete))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Taxa Pagar.me</dt><dd>{formatCurrency(Number(pedido.taxa_pagarme))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Comissão</dt><dd>{formatCurrency(Number(pedido.comissao))}</dd></div>
                <div className="flex justify-between border-t pt-3"><dt className="font-medium">Valor Líquido</dt><dd className="font-bold text-primary">{formatCurrency(Number(pedido.valor_liquido))}</dd></div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Rastreio e Entrega */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-4 w-4" /> Rastreio e Entrega
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleConsultarRastreio}
                disabled={trackingLoading || (!pedido.rastreio_codigo && !pedido.superfrete_order_id)}
              >
                {trackingLoading ? "Consultando..." : "Consultar SuperFrete"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Código de Rastreio</dt>
                <dd className="font-medium">{pedido.rastreio_codigo || "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Data de Despacho</dt>
                <dd>{pedido.data_despacho ? format(new Date(pedido.data_despacho), "dd/MM/yyyy") : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground flex items-center gap-1">
                  <PackageCheck className="h-3.5 w-3.5" /> Data de Entrega
                </dt>
                <dd className="font-medium">{pedido.data_entrega ? format(new Date(pedido.data_entrega), "dd/MM/yyyy") : "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Itens */}
        <Card>
          <CardHeader><CardTitle className="text-base">Itens do Pedido</CardTitle></CardHeader>
          <CardContent>
            {!itens?.length ? (
              <p className="text-muted-foreground text-sm">Nenhum item registrado</p>
            ) : (
              <div className="space-y-2">
                {itens.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 p-3 rounded-md bg-muted/50 text-sm">
                    <span className="font-medium flex-1">{item.nome_produto}</span>
                    <span>Qtd: {item.quantidade}</span>
                    {item.tamanho && <Badge variant="outline">{item.tamanho}</Badge>}
                    {item.cor && <Badge variant="outline">{item.cor}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
