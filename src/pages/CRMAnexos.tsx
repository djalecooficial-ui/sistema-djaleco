import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Plus, ArrowLeft, Paperclip, Pencil, Trash2, FileText, Image as ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";

type Anexo = {
  id: string;
  titulo: string;
  categoria: string | null;
  file_url: string;
  file_name: string;
  file_mime: string;
  file_size: number | null;
};

const BUCKET = "crm-attachments";

const formatSize = (bytes: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function CRMAnexos() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Anexo | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [form, setForm] = useState({ titulo: "", categoria: "" });
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: anexos, isLoading } = useQuery<Anexo[]>({
    queryKey: ["crm_attachments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_attachments")
        .select("*")
        .order("categoria", { ascending: true, nullsFirst: false })
        .order("titulo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Anexo[];
    },
  });

  const openFilePicker = () => fileInputRef.current?.click();

  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setEditing(null);
    setForm({ titulo: file.name.replace(/\.[^.]+$/, ""), categoria: "" });
    setUploadOpen(true);
    e.target.value = "";
  };

  const openEdit = (a: Anexo) => {
    setEditing(a);
    setPendingFile(null);
    setForm({ titulo: a.titulo, categoria: a.categoria ?? "" });
    setUploadOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase
          .from("crm_attachments")
          .update({ titulo: form.titulo.trim(), categoria: form.categoria.trim() || null })
          .eq("id", editing.id);
        if (error) throw error;
        return;
      }
      if (!pendingFile) throw new Error("Selecione um arquivo");
      const ext = pendingFile.name.split(".").pop() || "bin";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, pendingFile, { contentType: pendingFile.type || "application/octet-stream" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error } = await supabase.from("crm_attachments").insert({
        titulo: form.titulo.trim(),
        categoria: form.categoria.trim() || null,
        file_url: pub.publicUrl,
        file_name: pendingFile.name,
        file_mime: pendingFile.type || "application/octet-stream",
        file_size: pendingFile.size,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Anexo atualizado" : "Anexo adicionado");
      qc.invalidateQueries({ queryKey: ["crm_attachments"] });
      setUploadOpen(false);
      setPendingFile(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
    onMutate: () => setUploading(true),
    onSettled: () => setUploading(false),
  });

  const remove = useMutation({
    mutationFn: async (a: Anexo) => {
      const { error } = await supabase.from("crm_attachments").delete().eq("id", a.id);
      if (error) throw error;
      const path = a.file_url.split(`${BUCKET}/`)[1];
      if (path) await supabase.storage.from(BUCKET).remove([path]);
    },
    onSuccess: () => {
      toast.success("Anexo removido");
      qc.invalidateQueries({ queryKey: ["crm_attachments"] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const grouped = (anexos ?? []).reduce<Record<string, Anexo[]>>((acc, a) => {
    const cat = a.categoria || "Geral";
    (acc[cat] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/crm")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Paperclip className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Biblioteca de Anexos</h1>
        </div>
        <Button onClick={openFilePicker}>
          <Upload className="h-4 w-4 mr-1" /> Enviar Arquivo
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
      </div>

      <p className="text-sm text-muted-foreground">
        Fotos, tabelas e documentos prontos para enviar no WhatsApp direto da conversa, sem precisar
        fazer upload de novo toda vez. Prefira arquivos pequenos e específicos (uma foto, um PDF de
        poucas páginas) em vez de arquivos muito grandes — carregam mais rápido pro cliente.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-md bg-muted animate-pulse" />
          <div className="h-20 rounded-md bg-muted animate-pulse" />
        </div>
      ) : !anexos || anexos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum anexo cadastrado ainda. Clique em "Enviar Arquivo" para começar.
        </Card>
      ) : (
        Object.entries(grouped).map(([categoria, items]) => (
          <div key={categoria} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {categoria}
            </h2>
            <div className="space-y-2">
              {items.map((a) => (
                <Card key={a.id} className="p-3 flex items-center gap-3">
                  {a.file_mime.startsWith("image/") ? (
                    <img src={a.file_url} alt={a.titulo} className="h-12 w-12 rounded-md object-cover shrink-0" />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{a.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {a.file_name} {a.file_size ? `· ${formatSize(a.file_size)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteId(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Dialog open={uploadOpen} onOpenChange={(v) => { setUploadOpen(v); if (!v) setPendingFile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Anexo" : "Novo Anexo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pendingFile && (
              <div className="flex items-center gap-2 text-sm bg-muted rounded-md p-2">
                {pendingFile.type.startsWith("image/") ? (
                  <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">{pendingFile.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatSize(pendingFile.size)}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex: Tabela de medidas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoria">Categoria</Label>
              <Input
                id="categoria"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Ex: Jalecos, Scrubs, Políticas..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!form.titulo.trim() || uploading || (!editing && !pendingFile)}
            >
              {uploading ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo deixará de estar disponível para enviar nas conversas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const a = (anexos ?? []).find((x) => x.id === deleteId);
                if (a) remove.mutate(a);
              }}
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
