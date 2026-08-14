import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MessageSquare, BookOpen, Paperclip, Bell, Settings2 } from "lucide-react";
import type { Board } from "./KanbanBoard";

export function CRMHeader({ board }: { board: Board }) {
  const navigate = useNavigate();
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  const handleEnableNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">CRM</h1>
      </div>

      <div className="flex items-center gap-1 rounded-md bg-muted p-1">
        <Button
          size="sm"
          variant={board === "whatsapp" ? "default" : "ghost"}
          className="h-7"
          onClick={() => navigate("/crm")}
        >
          Vendas WhatsApp
        </Button>
        <Button
          size="sm"
          variant={board === "site" ? "default" : "ghost"}
          className="h-7"
          onClick={() => navigate("/crm/site")}
        >
          Pedidos do Site
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => navigate(`/crm/colunas?board=${board}`)}>
          <Settings2 className="h-4 w-4 mr-1" /> Colunas
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/crm/base-conhecimento")}>
          <BookOpen className="h-4 w-4 mr-1" /> Base de Conhecimento
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/crm/anexos")}>
          <Paperclip className="h-4 w-4 mr-1" /> Anexos
        </Button>
        {notifPermission === "default" && (
          <Button variant="outline" size="sm" onClick={handleEnableNotifications}>
            <Bell className="h-4 w-4 mr-1" /> Ativar notificações
          </Button>
        )}
        {notifPermission === "denied" && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Notificações bloqueadas
          </Badge>
        )}
      </div>
    </div>
  );
}
