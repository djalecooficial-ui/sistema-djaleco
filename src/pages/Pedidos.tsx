import { AppLayout } from "@/components/layout/AppLayout";
import { usePedidos } from "@/hooks/usePedidos";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Search, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Pedidos() {
  const { data: pedidos, isLoading } = usePedidos();
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

  const filtered = pedidos?.filter(
    (p) =>
      p.cliente_nome.toLowerCase().includes(search.toLowerCase()) ||
      p.numero_pedido.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Pedidos</h1>
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sync Nuvemshop"}
          </Button>
          <Button asChild>
            <Link to="/pedidos/novo"><Plus className="h-4 w-4 mr-2" />Novo Pedido</Link>
          </Button>
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
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum pedido encontrado</TableCell></TableRow>
              ) : (
                filtered?.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => {}}>
                    <TableCell>
                      <Link to={`/pedidos/${p.id}`} className="font-medium text-primary hover:underline">
                        #{p.numero_pedido}
                      </Link>
                    </TableCell>
                    <TableCell>{p.cliente_nome}</TableCell>
                    <TableCell>{formatCurrency(Number(p.valor_bruto))}</TableCell>
                    <TableCell><Badge variant="outline">{p.origem}</Badge></TableCell>
                    <TableCell><Badge variant="secondary">{p.etapa_producao || "—"}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(p.data_pedido), "dd/MM/yyyy")}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppLayout>
  );
}

// Using Card inline import
import { Card } from "@/components/ui/card";
