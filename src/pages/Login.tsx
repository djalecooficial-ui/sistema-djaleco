import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import djalecoLogo from "@/assets/logo_Djaleco.png";
import { LogIn, Download, Share, Plus } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWA";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { canInstall, install, showManualInstall, isIOSDevice, isInstalled } = usePWAInstall();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error("Credenciais inválidas. Verifique email e senha.");
      setLoading(false);
      return;
    }

    toast.success("Login realizado com sucesso!");
    navigate("/", { replace: true });
  };

  const handleInstall = async () => {
    const accepted = await install();
    if (accepted) {
      toast.success("App instalado com sucesso!");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-4">
          <img src={djalecoLogo} alt="Djaleco" className="h-24 w-auto mx-auto object-contain" />
          <CardTitle className="text-xl">Entrar no sistema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="h-4 w-4 mr-2" />
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          {canInstall && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleInstall}
            >
              <Download className="h-4 w-4" />
              Instalar Aplicativo
            </Button>
          )}

          {showManualInstall && !isInstalled && (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">📱 Instale o app no celular</p>
              {isIOSDevice ? (
                <p className="flex items-center gap-1 flex-wrap">
                  Toque em <Share className="h-4 w-4 inline text-primary" /> e depois em <span className="font-medium">"Adicionar à Tela de Início"</span> <Plus className="h-3 w-3 inline" />
                </p>
              ) : (
                <p>
                  Toque no menu <span className="font-medium">⋮</span> do navegador e selecione <span className="font-medium">"Instalar aplicativo"</span> ou <span className="font-medium">"Adicionar à tela inicial"</span>.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
