import { AppLayout } from "@/components/layout/AppLayout";
import { useCliente, useUpdateCliente } from "@/hooks/useClientes";
import { usePedidos } from "@/hooks/usePedidos";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState, useEffect } from "react";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function ClienteDetalhe() {
  const { id } = useParams();
  const { data: cliente, isLoading } = useCliente(id);
  const { data: pedidos } = usePedidos();
  const updateCliente = useUpdateCliente();
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (cliente?.observacoes) setObs(cliente.observacoes);
  }, [cliente]);

  const pedidosCliente = pedidos?.filter(
    (p) => p.cliente_nome.toLowerCase() === cliente?.nome.toLowerCase()
  );

  const handleSaveObs = () => {
    if (!id) return;
    updateCliente.mutate(
      { id, observacoes: obs },
      { onSuccess: () => toast.success("Observações salvas!") }
    );
  };

  if (isLoading) return <AppLayout><div className="p-8 text-muted-foreground">Carregando...</div></AppLayout>;
  if (!cliente) return <AppLayout><div className="p-8 text-muted-foreground">Cliente não encontrado</div></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/clientes"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">{cliente.nome}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Dados Cadastrais</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-muted-foreground">Telefone</dt><dd>{cliente.telefone || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Email</dt><dd>{cliente.email || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Documento</dt><dd>{cliente.documento || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Cidade/Estado</dt><dd>{[cliente.cidade, cliente.estado].filter(Boolean).join("/") || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Origem</dt><dd><Badge variant="outline">{cliente.origem}</Badge></dd></div>
                <div>
                  <dt className="text-muted-foreground">Tags</dt>
                  <dd className="flex gap-1 flex-wrap mt-1">
                    {cliente.tags?.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                    {!cliente.tags?.length && "—"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Métricas</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Total Pedidos</dt><dd className="font-medium">{cliente.total_pedidos}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Total Gasto</dt><dd className="font-bold text-primary">{formatCurrency(Number(cliente.total_gasto))}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Primeira Compra</dt><dd>{cliente.primeira_compra ? format(new Date(cliente.primeira_compra), "dd/MM/yyyy") : "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Última Compra</dt><dd>{cliente.ultima_compra ? format(new Date(cliente.ultima_compra), "dd/MM/yyyy") : "—"}</dd></div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Observações */}
        <Card>
          <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={4} placeholder="Adicione observações sobre este cliente..." />
            <Button size="sm" onClick={handleSaveObs} disabled={updateCliente.isPending}>Salvar</Button>
          </CardContent>
        </Card>

        {/* Histórico de pedidos */}
        <Card>
          <CardHeader><CardTitle className="text-base">Histórico de Pedidos</CardTitle></CardHeader>
          <CardContent>
            {!pedidosCliente?.length ? (
              <p className="text-muted-foreground text-sm">Nenhum pedido encontrado</p>
            ) : (
              <div className="space-y-2">
                {pedidosCliente.map((p) => (
                  <Link
                    key={p.id}
                    to={`/pedidos/${p.id}`}
                    className="flex items-center justify-between p-3 rounded-md hover:bg-muted transition-colors text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-primary">#{p.numero_pedido}</span>
                      <Badge variant="secondary" className="text-xs">{p.etapa_producao || "—"}</Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">{format(new Date(p.data_pedido), "dd/MM/yyyy")}</span>
                      <span className="font-medium">{formatCurrency(Number(p.valor_bruto))}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
