import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { PedidoQuickViewDialog } from "@/components/crm/PedidoQuickViewDialog";
import { useContactCustomerInfo } from "@/hooks/useContactCustomerInfo";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Send,
  Package,
  StickyNote,
  ChevronDown,
  Pencil,
  Check,
  X,
  Download,
  Mic,
  Square,
  Trash2,
  FileText,
  RefreshCw,
  MoreVertical,
  UserCheck,
  UserPlus,
  Bot,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_atendimento", label: "Em Atendimento" },
  { value: "aguardando", label: "Aguardando" },
  { value: "resolvido", label: "Resolvido" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  site: "Site",
  indicacao: "Indicação",
  outro: "Outro",
};

const ORIGEM_CLASS: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-800 border-green-200",
  site: "bg-purple-100 text-purple-800 border-purple-200",
  indicacao: "bg-orange-100 text-orange-800 border-orange-200",
  outro: "bg-muted text-muted-foreground",
};

const currency = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const initialsOf = (name: string | null | undefined, fallback: string) =>
  (name && name.trim()
    ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("")
    : fallback.slice(-2)
  ).toUpperCase();

export default function CRMContato() {
  const { id } = useParams<{ id: string }>();
  const contactId = id ? String(id) : undefined;
  const qc = useQueryClient();

  const [notas, setNotas] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [pedidosOpen, setPedidosOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Audio recording
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordCancelledRef = useRef(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [pedidoModalId, setPedidoModalId] = useState<string | null>(null);
  const [deleteMsgId, setDeleteMsgId] = useState<string | null>(null);

  const { data: contato, isLoading } = useQuery({
    queryKey: ["crm_contact", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("*")
        .eq("id", contactId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });

  useEffect(() => {
    setNotas(contato?.notas ?? "");
    setNameDraft(contato?.nome ?? "");
  }, [contato?.id]);

  const updateContact = useMutation({
    mutationFn: async (
      patch: Partial<{ nome: string; status: string; notas: string; ai_enabled: boolean }>,
    ) => {
      const { error } = await supabase
        .from("crm_contacts")
        .update(patch)
        .eq("id", contactId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_contact", contactId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  const tel = onlyDigits(contato?.telefone);
  const { data: customerInfo } = useContactCustomerInfo(contato?.telefone);
  const { data: pedidos } = useQuery({
    queryKey: ["crm_contact_pedidos", contactId, tel],
    enabled: !!contato && !!tel,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, data_pedido, valor_bruto, cliente_telefone")
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      const suffix = tel.slice(-8);
      return (data ?? []).filter((p) =>
        onlyDigits(p.cliente_telefone).endsWith(suffix),
      );
    },
  });

  // Initial fetch of messages
  useEffect(() => {
    if (!contactId) return;
    console.log("CRMContato contactId:", contactId);
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("crm_messages")
        .select("*")
        .eq("contact_id", contactId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Erro ao buscar mensagens:", error);
        return;
      }
      setMessages(data ?? []);
    };
    fetchMessages();
  }, [contactId]);

  // Mark as read whenever we open this conversation
  useEffect(() => {
    if (!contactId) return;
    supabase
      .from("crm_contacts")
      .update({ unread_count: 0 })
      .eq("id", contactId)
      .then(({ error }) => {
        if (error) console.error("Erro ao marcar como lido:", error);
        else {
          qc.invalidateQueries({ queryKey: ["crm_contacts_kanban"] });
        }
      });
  }, [contactId, qc]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!contactId) return;
    const channel = supabase
      .channel(`crm-messages-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crm_messages",
          filter: `contact_id=eq.${contactId}`,
        },
        (payload) => {
          console.log("Realtime INSERT recebido:", payload.new);
          setMessages((prev) => {
            const isDuplicate = prev.some((m) => m.id === payload.new.id);
            if (isDuplicate) return prev;
            return [...prev, payload.new as any];
          });
        },
      )
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !contato || sending) return;
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      contact_id: contato.id,
      conteudo: text,
      direcao: "enviada",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft("");

    try {
      const { data: sendResp, error: fnError } = await supabase.functions.invoke(
        "evolution-send-message",
        { body: { telefone: contato.telefone, mensagem: text, contact_id: contato.id } },
      );
      if (fnError) throw fnError;

      const evolutionMessageId =
        (sendResp as any)?.evolution_message_id ?? null;

      const insertPayload = {
        contact_id: contato.id,
        conteudo: text,
        direcao: "enviada",
        ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
      };

      const { error: insertError } = evolutionMessageId
        ? await supabase
            .from("crm_messages")
            .upsert(insertPayload, {
              onConflict: "evolution_message_id",
              ignoreDuplicates: true,
            })
        : await supabase.from("crm_messages").insert(insertPayload);
      if (insertError) throw insertError;
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const [importing, setImporting] = useState(false);
  const [generatingSuggestion, setGeneratingSuggestion] = useState(false);

  const pickAudioMime = () => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const m of candidates) {
      // @ts-ignore
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
    }
    return "";
  };

  const startRecording = async () => {
    if (recording || sendingAudio) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickAudioMime();
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recordedChunksRef.current = [];
      recordCancelledRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setRecording(false);
        if (recordCancelledRef.current) {
          recordedChunksRef.current = [];
          setRecordingSeconds(0);
          return;
        }
        const blob = new Blob(recordedChunksRef.current, {
          type: mr.mimeType || "audio/webm",
        });
        recordedChunksRef.current = [];
        setRecordingSeconds(0);
        await sendRecordedAudio(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (e: any) {
      toast.error("Não foi possível acessar o microfone");
      console.error(e);
    }
  };

  const stopRecording = (cancel: boolean) => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    recordCancelledRef.current = cancel;
    if (mr.state !== "inactive") mr.stop();
  };

  const blobToBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const sendRecordedAudio = async (blob: Blob) => {
    if (!contato) return;
    setSendingAudio(true);
    try {
      const base64 = await blobToBase64(blob);
      const { data: sendResp, error: fnError } = await supabase.functions.invoke(
        "evolution-send-message",
        {
          body: {
            telefone: contato.telefone,
            contact_id: contato.id,
            audio_base64: base64,
          },
        },
      );
      if (fnError) throw fnError;
      const evolutionMessageId = (sendResp as any)?.evolution_message_id ?? null;

      // Upload to bucket for local playback
      const ext = (blob.type.includes("mp4") || blob.type.includes("m4a")) ? "m4a" : "webm";
      const path = `${contato.id}/sent-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("crm-media")
        .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: true });
      let publicUrl: string | null = null;
      if (!upErr) {
        const { data: pub } = supabase.storage.from("crm-media").getPublicUrl(path);
        publicUrl = pub.publicUrl;
      } else {
        console.error("upload audio enviado:", upErr);
      }

      const insertPayload: any = {
        contact_id: contato.id,
        conteudo: "",
        direcao: "enviada",
        media_type: "audio",
        media_mime: blob.type || "audio/webm",
        media_url: publicUrl,
        ...(evolutionMessageId ? { evolution_message_id: evolutionMessageId } : {}),
      };
      const { error: insertError } = evolutionMessageId
        ? await supabase
            .from("crm_messages")
            .upsert(insertPayload, {
              onConflict: "evolution_message_id",
              ignoreDuplicates: true,
            })
        : await supabase.from("crm_messages").insert(insertPayload);
      if (insertError) throw insertError;
      toast.success("Áudio enviado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar áudio");
    } finally {
      setSendingAudio(false);
    }
  };

  const handleReprocessMedia = async (messageId: string) => {
    setReprocessingId(messageId);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-reprocess-media",
        { body: { message_id: messageId } },
      );
      if (error) throw error;
      const mediaUrl = (data as any)?.media_url;
      if (mediaUrl) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, media_url: mediaUrl, media_type: m.media_type ?? "audio" } : m,
          ),
        );
        toast.success("Mídia recuperada");
      } else {
        toast.warning("Mídia não disponível");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao reprocessar mídia");
    } finally {
      setReprocessingId(null);
    }
  };

  const handleTranscribe = async (messageId: string) => {
    setTranscribingId(messageId);
    try {
      const { data, error } = await supabase.functions.invoke(
        "crm-transcribe-audio",
        { body: { message_id: messageId } },
      );
      if (error) throw error;
      const transcription = (data as any)?.transcription ?? "";
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, transcription } : m)),
      );
      if (!transcription) toast.warning("Transcrição vazia");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao transcrever");
    } finally {
      setTranscribingId(null);
    }
  };

  const handleImportHistory = async () => {
    if (!contactId || importing) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "evolution-import-history",
        { body: { contact_id: contactId } },
      );
      if (error) throw error;
      const imported = (data as any)?.imported ?? 0;
      const debug = (data as any)?.debug;
      if (imported > 0) {
        toast.success(`${imported} mensagem(ns) importada(s)`);
      } else {
        const attempts = debug?.attempts as any[] | undefined;
        const desc = attempts?.length
          ? attempts
              .map((a) => `${a.remoteJid}: status ${a.status}, ${a.count} msgs`)
              .join(" | ")
          : "Sem dados de debug";
        toast.warning("Nenhuma mensagem encontrada na Evolution", {
          description: desc,
          duration: 10000,
        });
        console.log("[import-history] debug:", debug);
      }
      // Refetch
      const { data: msgs } = await supabase
        .from("crm_messages")
        .select("*")
        .eq("contact_id", contactId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      setMessages(msgs ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao importar histórico");
    } finally {
      setImporting(false);
    }
  };

  const handleGenerateSuggestion = async () => {
    if (!contactId || generatingSuggestion) return;
    setGeneratingSuggestion(true);
    try {
      const { data, error } = await supabase.functions.invoke("crm-ai-respond", {
        body: { contact_id: contactId },
      });
      if (error) throw error;
      const action = (data as any)?.action;
      if (action === "escalate") {
        toast.info("A IA avaliou que essa conversa precisa de um atendente humano");
      } else if (action === "reply") {
        toast.success("Sugestão pronta");
      }
      qc.invalidateQueries({ queryKey: ["crm_contact", contactId] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao gerar sugestão");
    } finally {
      setGeneratingSuggestion(false);
    }
  };

  const handleUseSuggestion = (mensagens: string[]) => {
    setDraft(mensagens.join("\n\n"));
    supabase
      .from("crm_contacts")
      .update({ ai_suggestion: null })
      .eq("id", contactId!)
      .then(() => qc.invalidateQueries({ queryKey: ["crm_contact", contactId] }));
  };

  const handleDiscardSuggestion = () => {
    supabase
      .from("crm_contacts")
      .update({ ai_suggestion: null })
      .eq("id", contactId!)
      .then(() => qc.invalidateQueries({ queryKey: ["crm_contact", contactId] }));
  };

  const handleRefreshProfile = async () => {
    if (!contactId || refreshingProfile) return;
    setRefreshingProfile(true);
    try {
      const { error } = await supabase.functions.invoke(
        "crm-refresh-contact-profile",
        { body: { contact_id: contactId } },
      );
      if (error) throw error;
      toast.success("Dados atualizados");
      qc.invalidateQueries({ queryKey: ["crm_contact", contactId] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar perfil");
    } finally {
      setRefreshingProfile(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from("crm_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      toast.success("Mensagem apagada");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao apagar mensagem");
    } finally {
      setDeleteMsgId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-32 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (!contato) {
    return (
      <div className="p-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/crm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Link>
        </Button>
        <p className="text-muted-foreground">Contato não encontrado.</p>
      </div>
    );
  }

  const initials = initialsOf(contato.nome, contato.telefone ?? "?");
  const displayName = contato.nome || contato.telefone || "Sem nome";
  const origem = contato.origem ?? "outro";
  const pushName = (contato as any).push_name as string | null;
  const avatarUrl = (contato as any).avatar_url as string | null;
  const isCustomer = !!customerInfo?.isCustomer;
  const cliente = customerInfo?.cliente;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] md:h-[calc(100vh-64px)] overflow-hidden">
      {/* Left panel */}
      <aside className="md:w-[35%] md:max-w-md border-b md:border-b-0 md:border-r bg-card overflow-y-auto">
        <div className="p-4 space-y-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/crm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Link>
          </Button>

          <div className="flex flex-col items-center text-center gap-3 pb-4 border-b">
            <Avatar className="h-20 w-20">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-2xl">
                {initials}
              </AvatarFallback>
            </Avatar>

            {editingName ? (
              <div className="flex items-center gap-1 w-full">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-8"
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    const v = nameDraft.trim();
                    if (v && v !== contato.nome) {
                      updateContact.mutate(
                        { nome: v },
                        { onSuccess: () => toast.success("Nome atualizado") },
                      );
                    }
                    setEditingName(false);
                  }}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setNameDraft(contato.nome ?? "");
                    setEditingName(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group inline-flex items-center gap-1.5 hover:text-primary"
              >
                <h1 className="text-lg font-semibold">{displayName}</h1>
                <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
              </button>
            )}

            {pushName && !contato.nome && (
              <button
                type="button"
                onClick={() =>
                  updateContact.mutate(
                    { nome: pushName },
                    { onSuccess: () => toast.success("Nome salvo") },
                  )
                }
                className="text-xs inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <UserPlus className="h-3 w-3" />
                Salvar “{pushName}” como nome
              </button>
            )}

            <p className="text-sm text-muted-foreground">{contato.telefone}</p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Badge
                variant="outline"
                className={
                  isCustomer
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }
              >
                {isCustomer ? "Cliente" : "Lead"}
              </Badge>
              <Badge variant="outline" className={ORIGEM_CLASS[origem] ?? ""}>
                {ORIGEM_LABEL[origem] ?? origem}
              </Badge>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshProfile}
              disabled={refreshingProfile}
              className="text-xs h-7"
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${refreshingProfile ? "animate-spin" : ""}`} />
              Atualizar do WhatsApp
            </Button>

            {isCustomer && cliente && (
              <div className="w-full rounded-md border bg-emerald-50 dark:bg-emerald-950/30 text-left text-xs p-2 space-y-0.5">
                <p className="font-medium inline-flex items-center gap-1.5 text-emerald-900 dark:text-emerald-300">
                  <UserCheck className="h-3.5 w-3.5" />
                  Cliente cadastrado
                </p>
                <p className="text-muted-foreground">
                  {cliente.total_pedidos ?? 0} pedido(s) · {currency(Number(cliente.total_gasto ?? 0))}
                </p>
                <Link
                  to={`/clientes/${cliente.id}`}
                  className="text-primary underline"
                >
                  Abrir ficha do cliente
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select
              value={contato.status ?? "novo"}
              onValueChange={(v) =>
                updateContact.mutate(
                  { status: v },
                  { onSuccess: () => toast.success("Status atualizado") },
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Collapsible open={pedidosOpen} onOpenChange={setPedidosOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm font-medium hover:bg-muted">
              <span className="inline-flex items-center gap-2">
                <Package className="h-4 w-4" /> Pedidos Vinculados
                {pedidos && (
                  <Badge variant="secondary" className="h-5">
                    {pedidos.length}
                  </Badge>
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${pedidosOpen ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              {!pedidos || pedidos.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1 py-2">
                  Nenhum pedido vinculado.
                </p>
              ) : (
                <div className="divide-y">
                  {pedidos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPedidoModalId(p.id)}
                      className="w-full flex items-center justify-between py-2 text-sm text-left hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">#{p.numero_pedido}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.data_pedido
                            ? format(new Date(p.data_pedido), "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "—"}
                        </span>
                      </div>
                      <span className="font-semibold text-sm">
                        {currency(p.valor_bruto)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Anotações
            </label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observações sobre este contato..."
              rows={5}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() =>
                  updateContact.mutate(
                    { notas },
                    { onSuccess: () => toast.success("Anotações salvas") },
                  )
                }
                disabled={updateContact.isPending || notas === (contato.notas ?? "")}
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Right panel */}
      <section className="flex-1 flex flex-col min-w-0 bg-muted/20">
        <header className="px-4 md:px-6 py-3 border-b bg-card flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-9 w-9 shrink-0">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="font-semibold truncate">{displayName}</h2>
              <p className="text-xs text-muted-foreground">{contato.telefone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={
                isCustomer
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-slate-100 text-slate-700 border-slate-200"
              }
            >
              {isCustomer ? "Cliente" : "Lead"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportHistory}
              disabled={importing}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              {importing ? "Importando..." : "Importar histórico"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateSuggestion}
              disabled={generatingSuggestion}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              {generatingSuggestion ? "Gerando..." : "Gerar sugestão agora"}
            </Button>
            <Badge variant="outline">
              {STATUS_LABEL[contato.status ?? "novo"] ?? contato.status}
            </Badge>
            <div className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5">
              <Bot className={`h-3.5 w-3.5 ${contato.ai_enabled ? "text-primary" : "text-muted-foreground"}`} />
              <label htmlFor="ai-toggle" className="text-xs font-medium cursor-pointer select-none">
                Respostas por IA
              </label>
              <Switch
                id="ai-toggle"
                checked={contato.ai_enabled ?? true}
                onCheckedChange={(v) =>
                  updateContact.mutate(
                    { ai_enabled: v },
                    {
                      onSuccess: () =>
                        toast.success(v ? "IA reativada para este contato" : "IA desativada — você assumiu a conversa"),
                    },
                  )
                }
              />
            </div>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nenhuma mensagem ainda.
            </p>
          ) : (
            messages.map((m) => {
              const enviada = m.direcao === "enviada";
              const mediaType = m.media_type as string | null;
              const mediaUrl = m.media_url as string | null;
              const caption = m.caption as string | null;
              const filename = m.media_filename as string | null;
              const legacyMedia =
                !mediaType && m.conteudo === "[mídia]";
              const textBody = caption || (mediaType ? "" : m.conteudo) || "";
              return (
                <div
                  key={m.id}
                  className={`group/msg flex ${enviada ? "justify-end" : "justify-start"}`}
                >
                  {enviada && (
                    <div className="self-center mr-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteMsgId(m.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Apagar mensagem
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                  <div
                    className={`relative max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
                      enviada
                        ? "bg-[#075E54] text-white rounded-br-sm"
                        : "bg-white border rounded-bl-sm"
                    }`}
                  >
                    {mediaUrl && (mediaType === "image" || mediaType === "sticker") && (
                      <a href={mediaUrl} target="_blank" rel="noreferrer" className="block mb-1">
                        <img
                          src={mediaUrl}
                          alt={filename || "imagem"}
                          loading="lazy"
                          className="rounded-lg max-h-64 object-cover"
                        />
                      </a>
                    )}
                    {mediaUrl && mediaType === "video" && (
                      <video
                        src={mediaUrl}
                        controls
                        className="rounded-lg max-h-64 mb-1"
                      />
                    )}
                    {mediaUrl && mediaType === "audio" && (
                      <div className="mb-1 space-y-1">
                        <audio src={mediaUrl} controls className="w-full" />
                        <button
                          type="button"
                          onClick={() => handleTranscribe(m.id)}
                          disabled={transcribingId === m.id || !!m.transcription}
                          className={`text-[11px] inline-flex items-center gap-1 underline ${enviada ? "text-white/90" : "text-primary"} disabled:opacity-60`}
                        >
                          <FileText className="h-3 w-3" />
                          {m.transcription
                            ? "Transcrito"
                            : transcribingId === m.id
                            ? "Transcrevendo..."
                            : "Transcrever áudio"}
                        </button>
                        {m.transcription && (
                          <p className={`text-xs italic whitespace-pre-wrap ${enviada ? "text-white/90" : "text-muted-foreground"}`}>
                            "{m.transcription}"
                          </p>
                        )}
                      </div>
                    )}
                    {mediaUrl && mediaType === "document" && (
                      <a
                        href={mediaUrl}
                        download={filename || true}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-2 underline mb-1 ${enviada ? "text-white" : "text-primary"}`}
                      >
                        <Download className="h-4 w-4" />
                        {filename || "Baixar documento"}
                      </a>
                    )}
                    {mediaType && !mediaUrl && (
                      <div className="mb-1 space-y-1">
                        <p className={`text-xs italic ${enviada ? "text-white/80" : "text-muted-foreground"}`}>
                          [{mediaType}] mídia indisponível
                        </p>
                        <button
                          type="button"
                          onClick={() => handleReprocessMedia(m.id)}
                          disabled={reprocessingId === m.id}
                          className={`text-[11px] inline-flex items-center gap-1 underline ${enviada ? "text-white/90" : "text-primary"} disabled:opacity-60`}
                        >
                          <RefreshCw className={`h-3 w-3 ${reprocessingId === m.id ? "animate-spin" : ""}`} />
                          {reprocessingId === m.id ? "Buscando..." : "Recuperar mídia"}
                        </button>
                      </div>
                    )}
                    {legacyMedia && (
                      <div className="mb-1 space-y-1">
                        <p className={`text-xs italic ${enviada ? "text-white/80" : "text-muted-foreground"}`}>
                          [mídia antiga não armazenada]
                        </p>
                        {m.evolution_message_id && (
                          <button
                            type="button"
                            onClick={() => handleReprocessMedia(m.id)}
                            disabled={reprocessingId === m.id}
                            className={`text-[11px] inline-flex items-center gap-1 underline ${enviada ? "text-white/90" : "text-primary"} disabled:opacity-60`}
                          >
                            <RefreshCw className={`h-3 w-3 ${reprocessingId === m.id ? "animate-spin" : ""}`} />
                            {reprocessingId === m.id ? "Buscando..." : "Recuperar mídia"}
                          </button>
                        )}
                      </div>
                    )}
                    {textBody && !legacyMedia && (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {textBody}
                      </p>
                    )}
                    <div
                      className={`flex items-center gap-1.5 mt-1 ${
                        enviada ? "justify-end" : "justify-between"
                      }`}
                    >
                      {m.is_ai_generated && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[10px] ${
                            enviada ? "text-white/70" : "text-muted-foreground"
                          }`}
                        >
                          <Bot className="h-2.5 w-2.5" /> IA
                        </span>
                      )}
                      <p
                        className={`text-[10px] ${
                          enviada ? "text-white/70" : "text-muted-foreground"
                        }`}
                      >
                        {format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  {!enviada && (
                    <div className="self-center ml-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteMsgId(m.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Apagar mensagem
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {Array.isArray(contato.ai_suggestion) && contato.ai_suggestion.length > 0 && (
          <div className="mx-3 md:mx-4 mb-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Sugestão da IA
            </div>
            <div className="space-y-1.5">
              {(contato.ai_suggestion as string[]).map((m, i) => (
                <p key={i} className="text-sm bg-background rounded-md px-2.5 py-1.5 border">
                  {m}
                </p>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleDiscardSuggestion}>
                Descartar
              </Button>
              <Button
                size="sm"
                onClick={() => handleUseSuggestion(contato.ai_suggestion as string[])}
              >
                Usar
              </Button>
            </div>
          </div>
        )}

        <div className="border-t bg-card p-3 md:p-4">
          {recording ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => stopRecording(true)}
                className="shrink-0 text-destructive"
                aria-label="Cancelar gravação"
              >
                <Trash2 className="h-5 w-5" />
              </Button>
              <div className="flex-1 flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-mono">
                  {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
                  {String(recordingSeconds % 60).padStart(2, "0")}
                </span>
                <span className="text-xs text-muted-foreground ml-2">Gravando áudio...</span>
              </div>
              <Button
                onClick={() => stopRecording(false)}
                className="shrink-0"
                aria-label="Enviar áudio"
              >
                <Send className="h-4 w-4 mr-2" />
                Enviar
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Digite uma mensagem..."
                  rows={1}
                  className="resize-none min-h-[40px] max-h-40"
                  disabled={sendingAudio}
                />
                {draft.trim() ? (
                  <Button
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="shrink-0"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {sending ? "Enviando..." : "Enviar"}
                  </Button>
                ) : (
                  <Button
                    onClick={startRecording}
                    disabled={sendingAudio}
                    variant="secondary"
                    size="icon"
                    className="shrink-0 h-10 w-10"
                    aria-label="Gravar áudio"
                  >
                    <Mic className="h-5 w-5" />
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {sendingAudio ? "Enviando áudio..." : "Ctrl+Enter para enviar · Toque no microfone para gravar"}
              </p>
            </>
          )}
        </div>
      </section>

      <PedidoQuickViewDialog
        pedidoId={pedidoModalId}
        open={!!pedidoModalId}
        onOpenChange={(v) => !v && setPedidoModalId(null)}
      />

      <AlertDialog
        open={!!deleteMsgId}
        onOpenChange={(v) => !v && setDeleteMsgId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem será ocultada do sistema. Esta ação só remove do CRM —
              não apaga no WhatsApp do destinatário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMsgId && handleDeleteMessage(deleteMsgId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
