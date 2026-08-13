import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, MessageSquare, Phone, ArrowLeft, Bot, BookOpen, Sparkles, Paperclip } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

type ColumnKey = "novo" | "em_atendimento" | "aguardando" | "resolvido";

const COLUMNS: {
  key: ColumnKey;
  label: string;
  dot: string;
  ring: string;
}[] = [
  { key: "novo", label: "Novo", dot: "bg-blue-500", ring: "border-blue-500/30" },
  { key: "em_atendimento", label: "Em Atendimento", dot: "bg-yellow-500", ring: "border-yellow-500/30" },
  { key: "aguardando", label: "Aguardando", dot: "bg-purple-500", ring: "border-purple-500/30" },
  { key: "resolvido", label: "Resolvido", dot: "bg-green-500", ring: "border-green-500/30" },
];

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  site: "Site",
  indicacao: "Indicação",
  outro: "Outro",
};

const ORIGEM_CLASS: Record<string, string> = {
  whatsapp: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  site: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  indicacao: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  outro: "bg-muted text-muted-foreground border-border",
};

const truncate = (s: string | null | undefined, n = 60) =>
  !s ? "" : s.length > n ? s.slice(0, n).trimEnd() + "…" : s;

type Contato = {
  id: string;
  nome: string | null;
  telefone: string | null;
  origem: string | null;
  status: string | null;
  unread_count?: number | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  avatar_url?: string | null;
  push_name?: string | null;
  is_customer?: boolean;
  ai_enabled?: boolean | null;
  ai_suggestion?: unknown;
};

function ContactCard({
  c,
  onClick,
}: {
  c: Contato;
  onClick: () => void;
}) {
  const unread = (c.unread_count ?? 0) > 0;
  const lastDate = c.last_message_at ?? c.updated_at ?? c.created_at;
  const displayName = c.nome || c.push_name || c.telefone || "—";
  const initials = (displayName || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Card
      onClick={onClick}
      className={`p-3 cursor-pointer hover:shadow-md transition-all space-y-2 ${
        unread
          ? "border-green-500/60 bg-green-50 dark:bg-green-950/30 ring-1 ring-green-500/30"
          : "hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {unread && (
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
          )}
          <Avatar className="h-8 w-8 shrink-0">
            {c.avatar_url ? <AvatarImage src={c.avatar_url} alt={displayName} /> : null}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
          <span className="font-medium text-sm truncate">
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {unread && (
            <Badge className="text-[10px] h-5 px-1.5 bg-green-500 hover:bg-green-500 text-white border-0">
              {c.unread_count}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] ${
              c.is_customer
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                : "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/20"
            }`}
          >
            {c.is_customer ? "Cliente" : "Lead"}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] ${
              ORIGEM_CLASS[c.origem ?? "outro"] ?? ORIGEM_CLASS.outro
            }`}
          >
            {ORIGEM_LABEL[c.origem ?? "outro"] ?? c.origem}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Phone className="h-3 w-3" />
        <span className="truncate">{c.telefone}</span>
        <div className="ml-auto flex items-center gap-1">
          {Array.isArray(c.ai_suggestion) && (c.ai_suggestion as unknown[]).length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1 bg-primary/10 text-primary border-primary/30"
            >
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> sugestão pronta
            </Badge>
          )}
          {c.ai_enabled === false && (
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
            >
              <Bot className="h-2.5 w-2.5 mr-0.5" /> aguarda humano
            </Badge>
          )}
        </div>
      </div>
      {c.last_message_preview && (
        <p
          className={`text-xs line-clamp-2 leading-snug ${
            unread ? "font-medium text-foreground" : "text-foreground/80"
          }`}
        >
          {truncate(c.last_message_preview, 60)}
        </p>
      )}
      <div className="text-[11px] text-muted-foreground">
        {lastDate
          ? formatDistanceToNow(new Date(lastDate), {
              addSuffix: true,
              locale: ptBR,
            })
          : "—"}
      </div>
    </Card>
  );
}

function DraggableCard({
  c,
  onClick,
}: {
  c: Contato;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: c.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: "none" }}
    >
      <ContactCard c={c} onClick={onClick} />
    </div>
  );
}

function DroppableColumn({
  id,
  isOver,
  className,
  children,
}: {
  id: string;
  isOver?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver: over } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${
        over || isOver ? "ring-2 ring-primary/50 bg-primary/5" : ""
      }`}
    >
      {children}
    </div>
  );
}

export default function CRM() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    origem: "whatsapp",
    notas: "",
  });

  const { data: contatos, isLoading } = useQuery<Contato[]>({
    queryKey: ["crm_contacts_kanban"],
    queryFn: async () => {
      const [{ data, error }, { data: clientes }] = await Promise.all([
        supabase
          .from("crm_contacts")
          .select("*")
          .order("last_message_at", { ascending: false, nullsFirst: false }),
        supabase.from("clientes").select("telefone"),
      ]);
      if (error) throw error;
      const customerSuffixes = new Set(
        (clientes ?? [])
          .map((c: any) => String(c.telefone ?? "").replace(/\D/g, "").slice(-8))
          .filter(Boolean),
      );
      return ((data ?? []) as Contato[]).map((c) => ({
        ...c,
        is_customer: customerSuffixes.has(
          String(c.telefone ?? "").replace(/\D/g, "").slice(-8),
        ),
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("crm_contacts_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_contacts" },
        () => {
          qc.invalidateQueries({ queryKey: ["crm_contacts_kanban"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
  );

  const moveStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ColumnKey }) => {
      const { error } = await supabase
        .from("crm_contacts")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao mover"),
  });

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const contact = (contatos ?? []).find((c) => c.id === String(e.active.id));
    if (!contact) return;
    const target = overId as ColumnKey;
    if (!COLUMNS.some((c) => c.key === target)) return;
    if ((contact.status ?? "novo") === target) return;
    // optimistic
    qc.setQueryData<Contato[]>(["crm_contacts_kanban"], (old) =>
      (old ?? []).map((c) =>
        c.id === contact.id ? { ...c, status: target } : c,
      ),
    );
    moveStatus.mutate({ id: contact.id, status: target });
  }

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crm_contacts").insert({
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim() || null,
        origem: form.origem,
        status: "novo",
        notas: form.notas.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato criado");
      qc.invalidateQueries({ queryKey: ["crm_contacts_kanban"] });
      setOpen(false);
      setForm({ nome: "", telefone: "", email: "", origem: "whatsapp", notas: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar contato"),
  });

  const grouped = COLUMNS.reduce<Record<ColumnKey, Contato[]>>(
    (acc, col) => {
      acc[col.key] = (contatos ?? []).filter(
        (c) => (c.status ?? "novo") === col.key,
      );
      return acc;
    },
    { novo: [], em_atendimento: [], aguardando: [], resolvido: [] },
  );

  const activeContact = activeId
    ? (contatos ?? []).find((c) => c.id === activeId)
    : null;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">CRM / WhatsApp</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/crm/base-conhecimento")}>
            <BookOpen className="h-4 w-4 mr-1" /> Base de Conhecimento
          </Button>
          <Button variant="outline" onClick={() => navigate("/crm/anexos")}>
            <Paperclip className="h-4 w-4 mr-1" /> Anexos
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Novo Contato
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Contato</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas</Label>
                <Textarea id="notas" rows={3} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => create.mutate()} disabled={!form.nome.trim() || !form.telefone.trim() || create.isPending}>
                {create.isPending ? "Criando..." : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 md:-mx-6 md:px-6">
          {COLUMNS.map((col) => {
            const items = grouped[col.key] ?? [];
            return (
              <DroppableColumn
                key={col.key}
                id={col.key}
                className={`shrink-0 w-[300px] md:w-[320px] rounded-lg border bg-muted/30 p-3 flex flex-col h-[calc(100vh-180px)] transition-colors ${col.ring}`}
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                    <h2 className="font-semibold text-sm">{col.label}</h2>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {items.length}
                  </Badge>
                </div>
                <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                  {isLoading ? (
                    <div className="h-20 rounded-md bg-muted animate-pulse" />
                  ) : items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Arraste aqui ou nenhum contato
                    </p>
                  ) : (
                    items.map((c) => (
                      <DraggableCard
                        key={c.id}
                        c={c}
                        onClick={() => navigate(`/crm/${c.id}`)}
                      />
                    ))
                  )}
                </div>
              </DroppableColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeContact ? (
            <div className="w-[300px] md:w-[320px] rotate-2 shadow-2xl">
              <ContactCard c={activeContact} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}