import { AppLayout } from "@/components/layout/AppLayout";
import { usePedido, usePedidoItens, useUpdatePedido, useDeletePedido } from "@/hooks/usePedidos";
import { useVendedores } from "@/hooks/useVendedores";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Truck, PackageCheck, Trash2 } from "lucide-react";
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
  const deletePedido = useDeletePedido();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [trackingLoading, setTrackingLoading] = useState(false);

  const vendedor = vendedores?.find((v) => v.id === pedido?.vendedor_id);

  const handleVendedorChange = (vendedorId: string) => {
    if (!id) return;
    const v = vendedores?.find((vd) => vd.id === vendedorId);
    if (!v) return;
    const taxa = pedido?.origem === "whatsapp" ? ((v as any).taxa_comissao_whatsapp ?? v.taxa_comissao) : ((v as any).taxa_comissao_site ?? v.taxa_comissao);
    const base = Number(pedido?.valor_bruto || 0) - Number(pedido?.taxa_pagarme || 0) - Number((pedido as any)?.taxa_ted || 0) - Number(pedido?.frete || 0);
    const comissao = base > 0 ? base * (taxa / 100) : 0;
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
        const sourceLabel = data?.source === "seurastreio" ? "Seu Rastreio" : "SuperFrete";
        toast.success(`Rastreio consultado via ${sourceLabel}!`);
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
          <div className="ml-auto">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-2" />Excluir Pedido</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Tem certeza que deseja excluir este pedido?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação não pode ser desfeita. O pedido #{pedido.numero_pedido} será excluído permanentemente.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deletePedido.mutate(id!, { onSuccess: () => { toast.success("Pedido excluído!"); navigate("/pedidos"); } })}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
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
                      {vendedores?.map((v) => {
                        const taxa = pedido.origem === "whatsapp" ? ((v as any).taxa_comissao_whatsapp ?? v.taxa_comissao) : ((v as any).taxa_comissao_site ?? v.taxa_comissao);
                        return <SelectItem key={v.id} value={v.id}>{v.nome} ({taxa}%)</SelectItem>;
                      })}
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
            <CardHeader><CardTitle className="text-base">Valores e Pagamento</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Valor Bruto</dt><dd className="font-medium">{formatCurrency(Number(pedido.valor_bruto))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Frete</dt><dd>{formatCurrency(Number(pedido.frete))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Taxa Pagar.me</dt><dd>{formatCurrency(Number(pedido.taxa_pagarme))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Comissão</dt><dd>{formatCurrency(Number(pedido.comissao))}</dd></div>
                <div className="flex justify-between border-t pt-3"><dt className="font-medium">Valor Líquido</dt><dd className="font-bold text-primary">{formatCurrency(Number(pedido.valor_liquido))}</dd></div>
              </dl>
              <div className="mt-4 pt-4 border-t space-y-3">
                <div>
                  <dt className="text-muted-foreground text-sm mb-1">Status do Pagamento</dt>
                  <Select
                    value={(pedido as any).status_pagamento || "pendente"}
                    onValueChange={(v) => { if (!id) return; updatePedido.mutate({ id, status_pagamento: v }, { onSuccess: () => toast.success("Status atualizado!") }); }}
                  >
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="recebido">Recebido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm mb-1">Forma de Pagamento</dt>
                  <Select
                    value={(pedido as any).forma_pagamento || ""}
                    onValueChange={(v) => { if (!id) return; updatePedido.mutate({ id, forma_pagamento: v } as any, { onSuccess: () => toast.success("Forma de pagamento atualizada!") }); }}
                  >
                    <SelectTrigger className="w-48"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(pedido as any).forma_pagamento === "Cartão de Crédito" && (
                  <div>
                    <dt className="text-muted-foreground text-sm mb-1">Parcelas</dt>
                    <Select
                      value={String((pedido as any).parcelas || 1)}
                      onValueChange={(v) => { if (!id) return; updatePedido.mutate({ id, parcelas: parseInt(v) } as any, { onSuccess: () => toast.success("Parcelas atualizadas!") }); }}
                    >
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}x</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
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
                disabled={trackingLoading || (!pedido.superfrete_order_id && !pedido.rastreio_codigo)}
                title={!pedido.superfrete_order_id && !pedido.rastreio_codigo ? "Necessário código de rastreio ou etiqueta SuperFrete" : ""}
              >
                {trackingLoading ? "Consultando..." : "Consultar Rastreio"}
              </Button>
              {pedido.rastreio_codigo && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={`https://www.muambator.com.br/pacotes/${pedido.rastreio_codigo}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Rastrear nos Correios ↗
                  </a>
                </Button>
              )}
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
                    {(item as any).preco_unitario > 0 && (
                      <span className="text-muted-foreground">R$ {Number((item as any).preco_unitario).toFixed(2)}</span>
                    )}
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
