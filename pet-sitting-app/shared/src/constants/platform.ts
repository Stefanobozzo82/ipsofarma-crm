/** Costanti di piattaforma. I valori di commissione sono placeholder —
 * DA CONFERMARE con il business prima di collegare Stripe Connect (Fase 4):
 * il brief chiede una commissione "trasparente fin dall'inizio", quindi va
 * decisa e comunicata prima del lancio, non lasciata a un default silenzioso. */
export const PLATFORM = {
  CURRENCY: "EUR",
  DEFAULT_LOCALE: "it-IT",
  DEFAULT_COUNTRY: "IT",
  LAUNCH_REGION: "Calabria",
  LAUNCH_CITY: "Cosenza",
  /** @todo confermare prima della Fase 4 (pagamenti) */
  SITTER_COMMISSION_PERCENT: null as number | null,
  MEET_GREET_IS_FREE: true,
} as const;

export const PET_PHOTO_MAX_MB = 8;
export const VERIFICATION_DOCUMENT_MAX_MB = 12;
