export type BadgeTone = "positive" | "warning" | "negative" | "neutral";

export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

/** Stesso vocabolario di colore del mobile (components/StatusBadge.tsx):
 * positivo = attivo/risolto, warning = in attesa, negativo = rifiutato/aperto. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
    case "resolved":
    case "closed":
    case "completed":
      return "positive";
    case "pending":
    case "open":
    case "investigating":
      return "warning";
    case "rejected":
    case "suspended":
      return "negative";
    default:
      return "neutral";
  }
}
