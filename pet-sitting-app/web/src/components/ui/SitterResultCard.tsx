import type { SitterSearchResult } from "@fido/shared";
import { Star } from "lucide-react";

const PRICE_UNIT_LABELS: Record<string, string> = {
  per_walk: "a passeggiata",
  per_hour: "all'ora",
  per_night: "a notte",
  per_day: "al giorno",
  per_visit: "a visita",
};

/** Stessa logica foto-o-iniziale di SitterAvatar in mobile/ (Fase redesign
 * UI/UX) — qui riscritta per il web invece di condivisa, dato che i due
 * pacchetti non condividono componenti UI (solo @fido/shared per i tipi). */
function Avatar({ sitter }: { sitter: SitterSearchResult }) {
  if (sitter.avatarUrl) {
    return <img src={sitter.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent">
      <span className="font-display text-xl font-bold text-accent-ink">{sitter.firstName.charAt(0).toUpperCase()}</span>
    </div>
  );
}

export function SitterResultCard({ sitter }: { sitter: SitterSearchResult }) {
  return (
    <div className="flex gap-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <Avatar sitter={sitter} />

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <span className="font-display font-bold text-ink">{sitter.firstName}</span>
          <div className="text-right">
            <span className="font-display font-bold text-accent">{sitter.price.toFixed(0)}€</span>
            <span className="block text-xs text-ink-faint">{PRICE_UNIT_LABELS[sitter.priceUnit] ?? ""}</span>
          </div>
        </div>

        <span className="text-xs text-ink-faint">{sitter.distanceKm.toFixed(1)} km da te</span>

        {sitter.reviewCount > 0 ? (
          <div className="flex items-center gap-1">
            <div className="flex text-amber">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={13}
                  fill={i < Math.round(sitter.averageRating ?? 0) ? "currentColor" : "none"}
                  strokeWidth={1.5}
                />
              ))}
            </div>
            <span className="text-xs text-ink-faint">
              {sitter.averageRating?.toFixed(1)} · {sitter.reviewCount} recensioni
            </span>
          </div>
        ) : (
          <span className="text-xs text-ink-faint">Nessuna recensione ancora</span>
        )}

        {sitter.bio ? <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{sitter.bio}</p> : null}
      </div>
    </div>
  );
}
