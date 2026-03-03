import { AppLayout } from "@/components/layout/AppLayout";
import { useVendedores, useCreateVendedor, useUpdateVendedor, useDeleteVendedor } from "@/hooks/useVendedores";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Vendedores() {
  const { data: vendedores, isLoading } = useVendedores();
  const createVendedor = useCreateVendedor();
  const updateVendedor = useUpdateVendedor();
  const deleteVendedor = useDeleteVendedor();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", taxa_comissao: "10" });

  const resetForm = () => {
    setForm({ nome: "", email: "", telefone: "", taxa_comissao: "10" });
    setEditing(null);
  };

  const handleEdit = (v: NonNullable<typeof vendedores>[0]) => {
    setForm({ nome: v.nome, email: v.email || "", telefone: v.telefone || "", taxa_comissao: String(v.taxa_comissao) });
    setEditing(v.id);
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.nome) { toast.error("Nome é obrigatório"); return; }
    const data = {
      nome: form.nome,
      email: form.email || null,
      telefone: form.telefone || null,
      taxa_comissao: Number(form.taxa_comissao),
    };

    if (editing) {
      updateVendedor.mutate({ id: editing, ...data }, {
        onSuccess: () => { toast.success("Vendedor atualizado!"); setOpen(false); resetForm(); },
      });
    } else {
      createVendedor.mutate(data, {
        onSuccess: () => { toast.success("Vendedor criado!"); setOpen(false); resetForm(); },
      });
    }
  };

  const handleDelete = (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este vendedor?")) return;
    deleteVendedor.mutate(id, { onSuccess: () => toast.success("Vendedor excluído!") });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Vendedores</h1>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Novo Vendedor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Editar Vendedor" : "Novo Vendedor"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                <div><Label>Taxa de Comissão (%)</Label><Input type="number" value={form.taxa_comissao} onChange={(e) => setForm({ ...form, taxa_comissao: e.target.value })} /></div>
                <Button className="w-full" onClick={handleSubmit}>{editing ? "Salvar" : "Criar"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : (
                vendedores?.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{v.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{v.telefone || "—"}</TableCell>
                    <TableCell>{v.taxa_comissao}%</TableCell>
                    <TableCell><Badge variant={v.status === "ativo" ? "default" : "secondary"}>{v.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(v)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(v.id)}><Trash2 className="h-4 w-4" /></Button>
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
