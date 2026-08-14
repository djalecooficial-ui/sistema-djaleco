import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Settings2, Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import type { Board } from "@/components/crm/KanbanBoard";

type ColumnDef = {
  id: string;
  board: Board;
  key: string;
  label: string;
  cor: string;
  ordem: number;
};

const CORES = [
  { value: "blue", label: "Azul" },
  { value: "yellow", label: "Amarelo" },
  { value: "purple", label: "Roxo" },
  { value: "green", label: "Verde" },
  { value: "red", label: "Vermelho" },
  { value: "orange", label: "Laranja" },
  { value: "pink", label: "Rosa" },
  { value: "slate", label: "Cinza" },
];

const CORES_DOT: Record<string, string> = {
  blue: "bg-blue-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  green: "bg-green-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  slate: "bg-slate-400",
};

function slugify(label: string) {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function CRMColunas() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const board = (searchParams.get("board") as Board) || "whatsapp";
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ColumnDef | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [corInput, setCorInput] = useState("blue");
  const [deleting, setDeleting] = useState<ColumnDef | null>(null);
  const [moveToKey, setMoveToKey] = useState<string>("");

  const { data: columns } = useQuery<ColumnDef[]>({
    queryKey: ["crm_board_columns", board],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_board_columns")
        .select("*")
        .eq("board", board)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ColumnDef[];
    },
  });

  const { data: countsByKey } = useQuery<Record<string, number>>({
    queryKey: ["crm_board_columns_counts", board],
    queryFn: async () => {
      const query = supabase.from("crm_contacts").select("status");
      const { data, error } = board === "site" ? await query.eq("origem", "site") : await query.neq("origem", "site");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const s = row.status ?? "";
        counts[s] = (counts[s] ?? 0) + 1;
      }
      return counts;
    },
  });

  const openNew = () => {
    setEditing(null);
    setLabelInput("");
    setCorInput("blue");
    setDialogOpen(true);
  };

  const openEdit = (col: ColumnDef) => {
    setEditing(col);
    setLabelInput(col.label);
    setCorInput(col.cor);
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        const { error } = await supabase
          .from("crm_board_columns")
          .update({ label: labelInput.trim(), cor: corInput })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const key = slugify(labelInput) || `coluna_${Date.now()}`;
        const ordem = (columns?.length ?? 0);
        const { error } = await supabase.from("crm_board_columns").insert({
          board,
          key,
          label: labelInput.trim(),
          cor: corInput,
          ordem,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Coluna atualizada" : "Coluna criada");
      qc.invalidateQueries({ queryKey: ["crm_board_columns", board] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar coluna"),
  });

  const reorder = useMutation({
    mutationFn: async (novaOrdem: ColumnDef[]) => {
      await Promise.all(
        novaOrdem.map((col, idx) => supabase.from("crm_board_columns").update({ ordem: idx }).eq("id", col.id)),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_board_columns", board] }),
    onError: (e: any) => toast.error(e.message ?? "Erro ao reordenar"),
  });

  const moveAndDelete = useMutation({
    mutationFn: async () => {
      if (!deleting) return;
      const contatosNessaColuna = (countsByKey?.[deleting.key] ?? 0) > 0;
      if (contatosNessaColuna) {
        if (!moveToKey) throw new Error("Escolha para onde mover os contatos");
        const query = supabase.from("crm_contacts").update({ status: moveToKey }).eq("status", deleting.key);
        const { error: moveErr } = board === "site" ? await query.eq("origem", "site") : await query.neq("origem", "site");
        if (moveErr) throw moveErr;
      }
      const { error } = await supabase.from("crm_board_columns").delete().eq("id", deleting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Coluna removida");
      qc.invalidateQueries({ queryKey: ["crm_board_columns", board] });
      qc.invalidateQueries({ queryKey: ["crm_board_columns_counts", board] });
      qc.invalidateQueries({ queryKey: ["crm_contacts_kanban", board] });
      setDeleting(null);
      setMoveToKey("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover coluna"),
  });

  const move = (index: number, direction: -1 | 1) => {
    if (!columns) return;
    const alvo = index + direction;
    if (alvo < 0 || alvo >= columns.length) return;
    const nova = [...columns];
    [nova[index], nova[alvo]] = [nova[alvo], nova[index]];
    reorder.mutate(nova);
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(board === "site" ? "/crm/site" : "/crm")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Settings2 className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Colunas do Quadro</h1>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Nova Coluna
        </Button>
      </div>

      <div className="flex items-center gap-1 rounded-md bg-muted p-1 w-fit">
        <Button
          size="sm"
          variant={board === "whatsapp" ? "default" : "ghost"}
          className="h-7"
          onClick={() => setSearchParams({ board: "whatsapp" })}
        >
          Vendas WhatsApp
        </Button>
        <Button
          size="sm"
          variant={board === "site" ? "default" : "ghost"}
          className="h-7"
          onClick={() => setSearchParams({ board: "site" })}
        >
          Pedidos do Site
        </Button>
      </div>

      <div className="space-y-2">
        {(columns ?? []).map((col, idx) => (
          <Card key={col.id} className="p-3 flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full shrink-0 ${CORES_DOT[col.cor] ?? CORES_DOT.slate}`} />
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{col.label}</p>
              <p className="text-xs text-muted-foreground">
                {countsByKey?.[col.key] ?? 0} contato(s)
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, -1)} disabled={idx === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(idx, 1)}
                disabled={idx === (columns?.length ?? 0) - 1}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(col)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={() => setDeleting(col)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Coluna" : "Nova Coluna"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="label">Nome da coluna</Label>
              <Input id="label" value={labelInput} onChange={(e) => setLabelInput(e.target.value)} placeholder="Ex: Negociando" />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <Select value={corInput} onValueChange={setCorInput}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${CORES_DOT[c.value]}`} />
                        {c.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={!labelInput.trim() || save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && (setDeleting(null), setMoveToKey(""))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover coluna "{deleting?.label}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {(countsByKey?.[deleting?.key ?? ""] ?? 0) > 0 ? (
                  <>
                    <p>
                      Essa coluna tem {countsByKey?.[deleting?.key ?? ""]} contato(s). Escolha para onde eles vão antes de remover:
                    </p>
                    <Select value={moveToKey} onValueChange={setMoveToKey}>
                      <SelectTrigger>
                        <SelectValue placeholder="Mover contatos para..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(columns ?? [])
                          .filter((c) => c.id !== deleting?.id)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.key}>
                              {c.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <p>Nenhum contato nessa coluna. Pode remover com segurança.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => moveAndDelete.mutate()}
              disabled={(countsByKey?.[deleting?.key ?? ""] ?? 0) > 0 && !moveToKey}
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
