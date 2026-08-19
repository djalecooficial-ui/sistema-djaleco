import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Notificação do sistema operacional para toda mensagem nova recebida no
// WhatsApp, não importa em qual tela do app o usuário estiver.
export function useNewMessageNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || typeof Notification === "undefined") return;

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    const channel = supabase
      .channel("global-new-messages-notify")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_messages" },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            contact_id: string;
            direcao: string;
            conteudo: string | null;
            media_type: string | null;
          };
          if (msg.direcao !== "recebida") return;
          if (Notification.permission !== "granted") return;

          const { data: contato } = await supabase
            .from("crm_contacts")
            .select("nome, telefone, push_name, origem")
            .eq("id", msg.contact_id)
            .maybeSingle();

          const nomeContato = contato?.nome || contato?.push_name || contato?.telefone || "Nova mensagem";
          const titulo = contato?.origem === "site" ? `[Site] ${nomeContato}` : nomeContato;
          const corpo =
            msg.conteudo?.trim() ||
            (msg.media_type ? `Enviou um(a) ${msg.media_type}` : "Nova mensagem");

          try {
            const notif = new Notification(titulo, {
              body: corpo,
              icon: "/pwa-icon-512.png",
              tag: msg.contact_id,
            });
            notif.onclick = () => {
              window.focus();
              window.location.href = `/crm/${msg.contact_id}`;
              notif.close();
            };
          } catch (e) {
            console.error("[notify] erro ao criar notificação", e);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}
