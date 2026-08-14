import { PawPrint, X } from "lucide-react";
import { createPortal } from "react-dom";
import { services } from "@/data/services";
import { Button } from "@/components/ui/Button";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Renderizzato via portal direttamente in <body>, non come figlio
 * dell'<header> — l'header ha backdrop-blur (backdrop-filter), che crea un
 * nuovo containing block per i discendenti position:fixed. Senza il
 * portal, "fixed inset-0" qui si sarebbe ridotto all'altezza dell'header
 * (66px) invece che al viewport intero: un gotcha CSS noto (transform,
 * filter e backdrop-filter su un antenato "catturano" i fixed). */
export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  return createPortal(
    <div
      className={`fixed inset-0 z-50 overflow-hidden transition ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-ink/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />

      {/* pannello */}
      <div
        className={`absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col gap-6 bg-surface p-6 shadow-lifted transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
            <PawPrint className="text-accent" size={22} />
            Fido
          </span>
          <button type="button" onClick={onClose} aria-label="Chiudi menu" className="p-1 text-ink-muted">
            <X size={22} />
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          <a href="#hero-search" onClick={onClose} className="rounded-xl px-3 py-3 font-display font-bold text-ink hover:bg-surface-muted">
            Cerca sitter
          </a>
          <a href="#" onClick={onClose} className="rounded-xl px-3 py-3 font-display font-bold text-ink hover:bg-surface-muted">
            Diventa un sitter
          </a>

          <span className="px-3 pt-3 text-xs font-display font-bold uppercase tracking-wide text-ink-faint">
            I nostri servizi
          </span>
          {services.map((service) => (
            <a
              key={service.id}
              href={`#servizi-${service.slug}`}
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-ink-muted hover:bg-surface-muted"
            >
              {service.label}
            </a>
          ))}

          <a href="#" onClick={onClose} className="mt-2 rounded-xl px-3 py-3 font-display font-bold text-ink hover:bg-surface-muted">
            Contatti
          </a>
        </nav>

        <div className="mt-auto flex flex-col gap-3 border-t border-line pt-6">
          <a href="#" className="text-center font-display font-bold text-ink-muted">
            Accedi
          </a>
          <Button href="#" variant="primary" className="w-full">
            Registrati ora
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
