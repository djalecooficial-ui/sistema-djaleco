import { AppLayout } from "@/components/layout/AppLayout";
import { usePedido, usePedidoItens, useUpdatePedido } from "@/hooks/usePedidos";
import { useVendedores } from "@/hooks/useVendedores";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

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

  const vendedor = vendedores?.find((v) => v.id === pedido?.vendedor_id);

  const handleEtapaChange = (etapa: string) => {
    if (!id) return;
    updatePedido.mutate(
      { id, etapa_producao: etapa, etapa_entrada_em: new Date().toISOString() },
      { onSuccess: () => toast.success("Etapa atualizada!") }
    );
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
                <div><dt className="text-muted-foreground">Vendedor</dt><dd>{vendedor?.nome || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Rastreio</dt><dd>{pedido.rastreio_codigo || "—"}</dd></div>
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
