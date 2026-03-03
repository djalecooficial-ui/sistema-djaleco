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
import { Search, Plus, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Pedido } from "@/hooks/usePedidos";

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

  const [syncingPagarme, setSyncingPagarme] = useState(false);

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

  const handleSyncPagarme = async () => {
    setSyncingPagarme(true);
    try {
      const { data, error } = await supabase.functions.invoke("pagarme-fees-sync");
      if (error) throw error;
      if (data?.success) {
        toast.success(data.message || "Taxas atualizadas!");
      } else {
        toast.error(data?.error || "Erro no sync de taxas");
      }
    } catch (e: any) {
      toast.error("Erro ao sincronizar taxas: " + (e.message || "erro desconhecido"));
    } finally {
      setSyncingPagarme(false);
    }
  };

  const handleEtapaChange = (pedidoId: string, novaEtapa: string) => {
    updatePedido.mutate(
      { id: pedidoId, etapa_producao: novaEtapa, etapa_entrada_em: new Date().toISOString() },
      { onSuccess: () => toast.success(`Etapa atualizada para ${novaEtapa}`) }
    );
  };

  const handleCopyWhatsApp = async (p: Pedido) => {
    try {
      const [itensRes, clienteRes] = await Promise.all([
        supabase.from("pedido_itens").select("*").eq("pedido_id", p.id),
        supabase.from("clientes").select("documento").eq("nome", p.cliente_nome).limit(1),
      ]);

      const itens = itensRes.data || [];
      const documento = clienteRes.data?.[0]?.documento || "";

      const pedidoDesc = itens
        .map((i) => {
          const parts = [`${i.quantidade}x ${i.nome_produto}`];
          if (i.tamanho) parts.push(i.tamanho);
          if (i.cor) parts.push(i.cor);
          return parts.join(" ");
        })
        .join(", ") || "";

      const texto = [
        `NOME: ${p.cliente_nome}`,
        `CELULAR: ${p.cliente_telefone || ""}`,
        `PROFISSÃO:`,
        `ENDEREÇO COMPLETO:`,
        `BAIRRO:`,
        `CIDADE: ${p.cidade || ""}`,
        `ESTADO: ${p.estado || ""}`,
        `CEP:`,
        `CPF/CNPJ: ${documento}`,
        `DATA DO PEDIDO: ${format(new Date(p.data_pedido), "dd/MM/yyyy")}`,
        `PEDIDO: ${pedidoDesc}`,
      ].join("\n");

      await navigator.clipboard.writeText(texto);
      toast.success("Copiado para a área de transferência!");
    } catch {
      toast.error("Erro ao copiar dados do pedido");
    }
  };

  const filtered = pedidos?.filter(
    (p) =>
      p.cliente_nome.toLowerCase().includes(search.toLowerCase()) ||
      p.numero_pedido.toLowerCase().includes(search.toLowerCase())
  );

  const pagos = filtered?.filter((p) => isPago(p)) || [];
  const pendentes = filtered?.filter((p) => !isPago(p)) || [];

  // Mobile card view for a pedido
  const renderMobileCard = (p: typeof pagos[0]) => (
    <Card key={p.id} className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Link to={`/pedidos/${p.id}`} className="font-medium text-primary hover:underline text-sm">
          #{p.numero_pedido}
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopyWhatsApp(p)} title="Copiar para WhatsApp">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Badge variant="outline" className="text-[10px]">{p.origem}</Badge>
        </div>
      </div>
      <p className="text-sm truncate">{p.cliente_nome}</p>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{formatCurrency(Number(p.valor_bruto))}</span>
        <span className="text-xs text-muted-foreground">{format(new Date(p.data_pedido), "dd/MM/yyyy")}</span>
      </div>
      <Select value={p.etapa_producao || ""} onValueChange={(v) => handleEtapaChange(p.id, v)}>
        <SelectTrigger className="w-full h-8 text-xs">
          <SelectValue placeholder="Etapa" />
        </SelectTrigger>
        <SelectContent>
          {ETAPAS.map((e) => (
            <SelectItem key={e} value={e}>{e}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  );

  const renderTable = (items: typeof pagos) => (
    <>
      {/* Desktop table */}
      <Card className="overflow-hidden hidden sm:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Valor Bruto</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum pedido encontrado</TableCell></TableRow>
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
                      <Select value={p.etapa_producao || ""} onValueChange={(v) => handleEtapaChange(p.id, v)}>
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
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCopyWhatsApp(p)} title="Copiar para WhatsApp">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum pedido encontrado</p>
        ) : (
          items.map(renderMobileCard)
        )}
      </div>
    </>
  );

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Pedidos</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSyncPagarme} disabled={syncingPagarme} className="flex-1 sm:flex-none">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncingPagarme ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{syncingPagarme ? "Sincronizando..." : "Taxas Pagarme"}</span>
              <span className="sm:hidden">{syncingPagarme ? "..." : "Taxas"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="flex-1 sm:flex-none">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{syncing ? "Sincronizando..." : "Sync Nuvemshop"}</span>
              <span className="sm:hidden">{syncing ? "Sync..." : "Sync"}</span>
            </Button>
            <Button asChild size="sm" className="flex-1 sm:flex-none">
              <Link to="/pedidos/novo"><Plus className="h-4 w-4 mr-2" />Novo</Link>
            </Button>
          </div>
        </div>

        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente ou número..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs defaultValue="pagos">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="pagos" className="flex-1 sm:flex-none">Pagos ({pagos.length})</TabsTrigger>
            <TabsTrigger value="pendentes" className="flex-1 sm:flex-none">Pendentes ({pendentes.length})</TabsTrigger>
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
