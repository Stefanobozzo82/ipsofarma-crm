import { PawPrint, Star } from "lucide-react";
import { SearchForm } from "@/components/ui/SearchForm";

/** Niente foto stock: un'illustrazione decorativa costruita in CSS/SVG
 * (blob sfumato + impronte) invece di immagini finte spacciate per vere —
 * onesto e sempre disponibile senza dover sourcizzare foto con diritti. */
function HeroIllustration() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md">
      <div className="absolute inset-0 rounded-[40%_60%_55%_45%/45%_40%_60%_55%] bg-gradient-to-br from-accent-soft via-amber-soft to-accent-soft" />
      <div className="absolute inset-0 flex items-center justify-center">
        <PawPrint size={140} strokeWidth={1.5} className="text-accent/70" />
      </div>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-surface px-4 py-3 shadow-lifted sm:left-4 sm:translate-x-0">
        <div className="flex text-amber">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={16} fill="currentColor" strokeWidth={0} />
          ))}
        </div>
        <span className="whitespace-nowrap text-sm font-display font-bold text-ink">4.9 su 5</span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="hero-search" className="bg-bg">
      <div className="mx-auto grid max-w-content items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
            Pet sitting di fiducia, <span className="text-accent">vicino a te</span>
          </h1>
          <p className="max-w-lg text-lg text-ink-muted">
            Trova sitter verificati per il tuo cane o gatto — passeggiate, ospitalità, visite a domicilio. Prenota
            in pochi minuti, in totale sicurezza.
          </p>

          <SearchForm />

          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <div className="flex text-amber">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={15} fill="currentColor" strokeWidth={0} />
              ))}
            </div>
            <span>4.9/5 — oltre 500 recensioni verificate</span>
          </div>
        </div>

        <HeroIllustration />
      </div>
    </section>
  );
}
