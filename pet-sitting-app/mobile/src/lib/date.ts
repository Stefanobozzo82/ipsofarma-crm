/** Componenti locali, non toISOString(): quest'ultimo converte in UTC e può
 * far slittare la data di un giorno vicino alla mezzanotte a seconda del
 * fuso orario del dispositivo — un bug classico dei date picker. */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toTimeString(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function formatDateIt(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}
