import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { subscribeToAnyNewMessage } from "@/features/chat/api";
import { playNotificationSound } from "@/lib/notification-sound";
import { useAuthStore } from "@/store/auth-store";
import { useUnreadMessagesStore } from "@/store/unread-messages-store";

/**
 * Nessun elemento visibile — montato una sola volta in App.tsx, sempre
 * (anche fuori da /messaggi), così un messaggio in arrivo si fa notare
 * indipendentemente dalla pagina su cui si è. Copre solo il caso "sito
 * aperto in una scheda": niente Service Worker/push vero, per quello serve
 * un giro diverso (vedi la nota in web/README.md).
 */
export function NotificationsWatcher() {
  const session = useAuthStore((s) => s.session);
  const markUnread = useUnreadMessagesStore((s) => s.markUnread);
  const location = useLocation();
  const navigate = useNavigate();

  // useLocation/useNavigate cambiano identità ad ogni navigazione, ma la
  // sottoscrizione realtime deve restare la stessa per tutta la sessione di
  // login — un ref tiene il valore corrente leggibile dalla callback senza
  // dover disiscrivere/re-iscrivere ad ogni cambio pagina.
  const locationRef = useRef(location);
  locationRef.current = location;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!session) return;
    const myId = session.user.id;

    const unsubscribe = subscribeToAnyNewMessage((message) => {
      if (message.senderId === myId) return; // eco del proprio messaggio, non un arrivo

      const onThatChatAlready = locationRef.current.pathname === `/messaggi/${message.conversationId}`;
      if (onThatChatAlready) return; // già visibile nel thread aperto, nessun avviso in più

      playNotificationSound();
      markUnread();

      // La notifica desktop del sistema operativo ha senso solo se non si
      // sta già guardando il sito: altrimenti il suono + il pallino sul
      // link "Messaggi" bastano e una Notification sarebbe ridondante.
      const tabHiddenOrUnfocused = document.visibilityState === "hidden" || !document.hasFocus();
      if (tabHiddenOrUnfocused && "Notification" in window && Notification.permission === "granted") {
        const notification = new Notification("Nuovo messaggio su Fido", {
          body: message.body,
          icon: "/favicon.svg",
          tag: `fido-message-${message.conversationId}`, // raggruppa più notifiche della stessa chat invece di accumularle
        });
        notification.onclick = () => {
          window.focus();
          navigateRef.current(`/messaggi/${message.conversationId}`);
          notification.close();
        };
      }
    });

    return unsubscribe;
  }, [session, markUnread]);

  return null;
}
