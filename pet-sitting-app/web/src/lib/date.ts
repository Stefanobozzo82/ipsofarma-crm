/** Porting di mobile/src/lib/date.ts. Componenti locali, non toISOString():
 * quest'ultimo converte in UTC e può far slittare la data di un giorno
 * vicino alla mezzanotte a seconda del fuso orario del browser. */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateIt(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

export const BOOKING_STATUS_LABELS_IT: Record<string, string> = {
  pending_request: "In attesa di conferma",
  confirmed: "Confermata",
  in_progress: "In corso",
  completed: "Completata",
  cancelled_by_owner: "Cancellata da te",
  cancelled_by_sitter: "Cancellata dal sitter",
  declined: "Rifiutata",
  disputed: "In contestazione",
};

export const PRICE_UNIT_LABELS_IT: Record<string, string> = {
  per_walk: "a passeggiata",
  per_hour: "all'ora",
  per_night: "a notte",
  per_day: "al giorno",
  per_visit: "a visita",
};
