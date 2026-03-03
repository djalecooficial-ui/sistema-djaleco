import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidos, useUpdatePedido } from "@/hooks/usePedidos";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Search, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ETAPAS = ["Planejamento", "Corte", "Costura", "Acabamento", "Embalagem", "Despachado", "Entregue"];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function isPago(p: { etapa_producao: string | null; valor_bruto: number; taxa_pagarme: number }) {
  if (Number(p.taxa_pagarme) > 0) return true;
  const etapa = p.etapa_producao || "";
  return Number(p.valor_bruto) > 0 && etapa !== "" && etapa !== "Novo" && etapa !== "Cancelado";
}

export default function Pedidos() {
  const { data: pedidos, isLoading } = usePedidos();
  const updatePedido = useUpdatePedido();
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("nuvemshop-sync");
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || "Sync concluído!");
      } else {
        toast.error(data?.error || "Erro no sync");
      }
    } catch (e: any) {
      toast.error("Erro ao sincronizar: " + (e.message || "erro desconhecido"));
    } finally {
      setSyncing(false);
    }
  };

  const handleEtapaChange = (pedidoId: string, novaEtapa: string) => {
    updatePedido.mutate(
      { id: pedidoId, etapa_producao: novaEtapa, etapa_entrada_em: new Date().toISOString() },
      { onSuccess: () => toast.success(`Etapa atualizada para ${novaEtapa}`) }
    );
  };

  const filtered = pedidos?.filter(
    (p) =>
      p.cliente_nome.toLowerCase().includes(search.toLowerCase()) ||
      p.numero_pedido.toLowerCase().includes(search.toLowerCase())
  );

  const pagos = filtered?.filter((p) => isPago(p)) || [];
  const pendentes = filtered?.filter((p) => !isPago(p)) || [];

  const renderTable = (items: typeof pagos) => (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº Pedido</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Valor Bruto</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum pedido encontrado</TableCell></TableRow>
          ) : (
            items.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link to={`/pedidos/${p.id}`} className="font-medium text-primary hover:underline">
                    #{p.numero_pedido}
                  </Link>
                </TableCell>
                <TableCell>{p.cliente_nome}</TableCell>
                <TableCell>{formatCurrency(Number(p.valor_bruto))}</TableCell>
                <TableCell><Badge variant="outline">{p.origem}</Badge></TableCell>
                <TableCell>
                  <Select
                    value={p.etapa_producao || ""}
                    onValueChange={(v) => handleEtapaChange(p.id, v)}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {ETAPAS.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-muted-foreground">{format(new Date(p.data_pedido), "dd/MM/yyyy")}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sync Nuvemshop"}
            </Button>
            <Button asChild>
              <Link to="/pedidos/novo"><Plus className="h-4 w-4 mr-2" />Novo Pedido</Link>
            </Button>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou número..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs defaultValue="pagos">
          <TabsList>
            <TabsTrigger value="pagos">Pagos ({pagos.length})</TabsTrigger>
            <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pagos" className="mt-4">
            {renderTable(pagos)}
          </TabsContent>
          <TabsContent value="pendentes" className="mt-4">
            {renderTable(pendentes)}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
