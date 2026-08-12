import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Plus, ArrowLeft, BookOpen, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type KBEntry = {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: string | null;
  updated_at?: string | null;
};

const emptyForm = { titulo: "", conteudo: "", categoria: "" };

export default function CRMBaseConhecimento() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KBEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: entries, isLoading } = useQuery<KBEntry[]>({
    queryKey: ["crm_knowledge_base"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_knowledge_base")
        .select("*")
        .order("categoria", { ascending: true, nullsFirst: false })
        .order("titulo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as KBEntry[];
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (e: KBEntry) => {
    setEditing(e);
    setForm({ titulo: e.titulo, conteudo: e.conteudo, categoria: e.categoria ?? "" });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        titulo: form.titulo.trim(),
        conteudo: form.conteudo.trim(),
        categoria: form.categoria.trim() || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("crm_knowledge_base")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("crm_knowledge_base").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Entrada atualizada" : "Entrada criada");
      qc.invalidateQueries({ queryKey: ["crm_knowledge_base"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_knowledge_base").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entrada removida");
      qc.invalidateQueries({ queryKey: ["crm_knowledge_base"] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const grouped = (entries ?? []).reduce<Record<string, KBEntry[]>>((acc, e) => {
    const cat = e.categoria || "Geral";
    (acc[cat] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/crm")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Base de Conhecimento</h1>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Nova Entrada
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Esse conteúdo é usado pela IA para responder automaticamente no WhatsApp. Cadastre aqui
        horário de atendimento, políticas de troca/devolução, formas de pagamento, prazo de
        entrega, tabela de medidas e o tom de voz da marca. A IA só responde com base no que
        estiver escrito aqui — o que não estiver documentado, ela encaminha para um atendente.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-md bg-muted animate-pulse" />
          <div className="h-20 rounded-md bg-muted animate-pulse" />
        </div>
      ) : !entries || entries.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma entrada cadastrada ainda. Clique em "Nova Entrada" para começar.
        </Card>
      ) : (
        Object.entries(grouped).map(([categoria, items]) => (
          <div key={categoria} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {categoria}
            </h2>
            <div className="space-y-2">
              {items.map((e) => (
                <Card key={e.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium">{e.titulo}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteId(e.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                    {e.conteudo}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Entrada" : "Nova Entrada"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex: Prazo de entrega"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoria">Categoria</Label>
              <Input
                id="categoria"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Ex: Entrega, Pagamento, Trocas, Sobre a empresa..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conteudo">Conteúdo</Label>
              <Textarea
                id="conteudo"
                rows={8}
                value={form.conteudo}
                onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                placeholder="Escreva a informação como se estivesse explicando para um atendente novo..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.titulo.trim() || !form.conteudo.trim() || save.isPending}
            >
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              A IA deixará de considerar essa informação ao responder no WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && remove.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
