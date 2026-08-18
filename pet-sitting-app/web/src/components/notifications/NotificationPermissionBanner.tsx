import { Bell, X } from "lucide-react";
import { useState } from "react";

const DISMISS_KEY = "fido-notif-banner-dismissed";

/**
 * Chiede il permesso di notifica desktop del browser — solo su interazione
 * esplicita (il pulsante "Attiva"), mai in automatico al caricamento:
 * un `Notification.requestPermission()` sparato da solo è sia una cattiva
 * pratica UX sia, su alcuni browser, ignorato/bloccato se non parte da un
 * gesto dell'utente. Non compare più se il browser non supporta le
 * notifiche, se il permesso è già stato deciso (concesso o negato), o se
 * l'utente ha già cliccato "No, grazie" in questa sessione del browser.
 */
export function NotificationPermissionBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "Notification" in window ? Notification.permission : "unsupported",
  );

  if (dismissed || permission !== "default") return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  async function handleEnable() {
    const result = await Notification.requestPermission();
    setPermission(result);
  }

  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <Bell size={18} className="mt-0.5 shrink-0 text-accent" strokeWidth={2} />
      <div className="flex-1">
        <p className="text-sm text-ink">
          Vuoi una notifica del browser quando arriva un nuovo messaggio, anche se sei su un'altra scheda?
        </p>
        <div className="mt-2 flex gap-4">
          <button type="button" onClick={handleEnable} className="text-sm font-display font-bold text-accent hover:text-accent/80">
            Attiva notifiche
          </button>
          <button type="button" onClick={dismiss} className="text-sm text-ink-faint hover:text-ink-muted">
            No, grazie
          </button>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Chiudi" className="shrink-0 text-ink-faint hover:text-ink-muted">
        <X size={16} />
      </button>
    </div>
  );
}
