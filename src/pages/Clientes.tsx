import { AppLayout } from "@/components/layout/AppLayout";
import { useClientes } from "@/hooks/useClientes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export default function Clientes() {
  const { data: clientes, isLoading } = useClientes();
  const [search, setSearch] = useState("");

  const filtered = clientes?.filter(
    (c) =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone?.includes(search)
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Total Gasto</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum cliente encontrado</TableCell></TableRow>
              ) : (
                filtered?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link to={`/clientes/${c.id}`} className="font-medium text-primary hover:underline">{c.nome}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.telefone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{[c.cidade, c.estado].filter(Boolean).join("/") || "—"}</TableCell>
                    <TableCell className="text-right">{c.total_pedidos}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(c.total_gasto))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {c.tags?.slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                      </div>
                    </TableCell>
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
