import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, KeyRound, Shield, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const CONFIGURABLE_PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "pedidos", label: "Pedidos" },
  { key: "producao", label: "Produção" },
  { key: "produtos", label: "Produtos" },
  { key: "clientes", label: "Clientes" },
  { key: "crm", label: "CRM" },
  { key: "carrinhos", label: "Carrinhos Abandonados" },
  { key: "financeiro", label: "Financeiro" },
  { key: "relatorios", label: "Relatórios" },
];

type Profile = { id: string; email: string | null; nome: string | null };
type Role = { user_id: string; role: "admin" | "user" };
type PageAccessRow = { user_id: string; page_key: string; allowed: boolean };

export default function Usuarios() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ nome: "", email: "", password: "", role: "user" as "admin" | "user" });
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const { data: profiles, isLoading } = useQuery<Profile[]>({
    queryKey: ["usuarios_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, email, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["usuarios_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return (data ?? []) as Role[];
    },
  });

  const { data: pageAccessRows } = useQuery<PageAccessRow[]>({
    queryKey: ["usuarios_page_access"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_page_access").select("user_id, page_key, allowed");
      if (error) throw error;
      return (data ?? []) as PageAccessRow[];
    },
  });

  const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  const accessByUser = new Map<string, Map<string, boolean>>();
  for (const row of pageAccessRows ?? []) {
    if (!accessByUser.has(row.user_id)) accessByUser.set(row.user_id, new Map());
    accessByUser.get(row.user_id)!.set(row.page_key, row.allowed);
  }

  const togglePage = useMutation({
    mutationFn: async ({ userId, pageKey, allowed }: { userId: string; pageKey: string; allowed: boolean }) => {
      const { error } = await supabase
        .from("user_page_access")
        .upsert({ user_id: userId, page_key: pageKey, allowed, updated_at: new Date().toISOString() }, { onConflict: "user_id,page_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios_page_access"] }),
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar permissão"),
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "user" }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Papel atualizado");
      qc.invalidateQueries({ queryKey: ["usuarios_roles"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar papel"),
  });

  const createUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: createForm,
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Usuário criado");
      setCreateOpen(false);
      setCreateForm({ nome: "", email: "", password: "", role: "user" });
      qc.invalidateQueries({ queryKey: ["usuarios_profiles"] });
      qc.invalidateQueries({ queryKey: ["usuarios_roles"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar usuário"),
  });

  const doResetPassword = useMutation({
    mutationFn: async () => {
      if (!resetTarget) return;
      const { data, error } = await supabase.functions.invoke("admin-reset-password", {
        body: { userId: resetTarget.id, password: resetPassword },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao redefinir senha"),
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
            <p className="text-sm text-muted-foreground">Crie logins e decida o que cada perfil pode ver</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-2" />Novo Usuário</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={createForm.nome} onChange={(e) => setCreateForm({ ...createForm, nome: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail *</Label>
                  <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                </div>
                <div>
                  <Label>Senha inicial *</Label>
                  <Input type="text" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Mínimo 8 caracteres" />
                </div>
                <div>
                  <Label>Papel</Label>
                  <Select value={createForm.role} onValueChange={(v: "admin" | "user") => setCreateForm({ ...createForm, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuário (acesso configurável)</SelectItem>
                      <SelectItem value="admin">Administrador (acesso total)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  className="w-full"
                  disabled={createUser.isPending || !createForm.email || createForm.password.length < 8}
                  onClick={() => createUser.mutate()}
                >
                  Criar usuário
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        <div className="space-y-4">
          {(profiles ?? []).map((p) => {
            const role = roleByUser.get(p.id) ?? "user";
            const isAdminUser = role === "admin";
            const access = accessByUser.get(p.id);

            return (
              <Card key={p.id} className="p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.nome || p.email}</span>
                      {isAdminUser && (
                        <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" />Admin</Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">{p.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={role}
                      onValueChange={(v: "admin" | "user") => changeRole.mutate({ userId: p.id, role: v })}
                      disabled={p.id === currentUser?.id}
                    >
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Usuário</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setResetTarget(p)}>
                      <KeyRound className="h-4 w-4 mr-1" />Redefinir senha
                    </Button>
                  </div>
                </div>

                {isAdminUser ? (
                  <p className="text-sm text-muted-foreground">Administrador vê e faz tudo no sistema — não dá pra restringir.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t">
                    {CONFIGURABLE_PAGES.map((page) => {
                      const allowed = access?.get(page.key) ?? true;
                      return (
                        <div key={page.key} className="flex items-center justify-between gap-2">
                          <Label className="text-sm font-normal">{page.label}</Label>
                          <Switch
                            checked={allowed}
                            onCheckedChange={(checked) =>
                              togglePage.mutate({ userId: p.id, pageKey: page.key, allowed: checked })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setResetPassword(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Redefinir senha de {resetTarget?.nome || resetTarget?.email}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nova senha</Label>
              <Input type="text" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Mínimo 8 caracteres" />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full"
              disabled={doResetPassword.isPending || resetPassword.length < 8}
              onClick={() => doResetPassword.mutate()}
            >
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
