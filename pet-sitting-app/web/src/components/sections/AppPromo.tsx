import { Apple, MessageCircle, PawPrint, PlayCircle, Search } from "lucide-react";

/** Badge store disattivati e onesti sullo stato ("in arrivo") invece di
 * link finti che promettono un download non ancora possibile — l'app non è
 * ancora pubblicata sugli store, vedi mobile/README.md. Aggiornare qui
 * quando lo sarà davvero. */
function StoreBadge({ icon: Icon, label }: { icon: typeof Apple; label: string }) {
  return (
    <div className="flex cursor-not-allowed items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 opacity-70">
      <Icon size={22} className="text-ink" />
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] text-ink-faint">Presto disponibile su</span>
        <span className="font-display font-bold text-ink">{label}</span>
      </div>
    </div>
  );
}

/** Mockup dello smartphone in puro CSS/SVG (nessuno screenshot reale ancora
 * disponibile) — una silhouette dell'interfaccia dell'app coerente con la
 * stessa palette terracotta, non un'immagine finta spacciata per reale. */
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-64 rounded-[2.5rem] border-[10px] border-ink bg-ink p-1.5 shadow-lifted">
      <div className="flex h-[520px] flex-col gap-3 overflow-hidden rounded-[1.75rem] bg-bg p-4">
        <div className="flex items-center gap-2">
          <PawPrint size={18} className="text-accent" />
          <div className="h-2.5 w-20 rounded-full bg-surface-muted" />
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
          <Search size={14} className="text-ink-faint" />
          <div className="h-2 w-24 rounded-full bg-surface-muted" />
        </div>

        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 w-16 rounded-full bg-accent-soft" />
          ))}
        </div>

        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <div className="h-11 w-11 shrink-0 rounded-full bg-accent" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-2.5 w-3/4 rounded-full bg-surface-muted" />
              <div className="h-2 w-1/2 rounded-full bg-surface-muted" />
            </div>
          </div>
        ))}
      </div>

      <div className="absolute -right-4 top-16 flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 shadow-lifted">
        <MessageCircle size={16} className="text-accent" />
        <span className="text-xs font-display font-bold text-ink">Nuovo messaggio</span>
      </div>
    </div>
  );
}

export function AppPromo() {
  return (
    <section className="bg-bg">
      <div className="mx-auto grid max-w-content items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <h2 className="text-3xl font-extrabold text-ink sm:text-4xl">Fido è ancora più comodo nell'app</h2>
          <p className="max-w-md text-lg text-ink-muted">
            Cerca sitter, chatta in tempo reale e segui la passeggiata del tuo cane in diretta, direttamente dal
            telefono.
          </p>
          <div className="flex flex-wrap gap-3">
            <StoreBadge icon={Apple} label="App Store" />
            <StoreBadge icon={PlayCircle} label="Google Play" />
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
