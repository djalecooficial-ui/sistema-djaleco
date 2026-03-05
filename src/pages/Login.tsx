import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import djalecoLogo from "@/assets/logo_sistema_djaleco.png";
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
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <Card className="w-full max-w-sm bg-black border-neutral-800">
        <CardHeader className="text-center space-y-4">
          <img src={djalecoLogo} alt="D.Jaleco Sistema de Gestão" className="h-48 w-auto mx-auto object-contain" />
          <CardTitle className="text-xl text-white">Entrar no sistema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-neutral-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-neutral-300">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-neutral-900 border-neutral-700 text-white placeholder:text-neutral-500"
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
            <div className="rounded-lg border border-primary/40 bg-black p-3 text-sm space-y-2">
              <p className="font-medium text-white">📱 Instale o app no celular</p>
              {isIOSDevice ? (
                <p className="flex items-center gap-1 flex-wrap text-primary">
                  Toque em <Share className="h-4 w-4 inline text-primary" /> e depois em <span className="font-medium text-white">"Adicionar à Tela de Início"</span> <Plus className="h-3 w-3 inline" />
                </p>
              ) : (
                <p className="text-primary">
                  Toque no menu <span className="font-medium text-white">⋮</span> do navegador e selecione <span className="font-medium text-white">"Instalar aplicativo"</span> ou <span className="font-medium text-white">"Adicionar à tela inicial"</span>.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
