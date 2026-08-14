/**
 * Costanti di piattaforma.
 *
 * Modello di commissione (confermato prima della Fase 4): il proprietario
 * paga esattamente il prezzo mostrato nel profilo del sitter, nessuna fee
 * aggiuntiva in checkout. La commissione è trattenuta solo dal payout del
 * sitter — evita la percezione di "doppia commissione" lamentata su Rover,
 * ed è il modello più semplice da comunicare ("il prezzo che vedi è il
 * prezzo che paghi"). Vedi backend/src/modules/bookings per il calcolo.
 */
export const PLATFORM = {
  CURRENCY: "EUR",
  DEFAULT_LOCALE: "it-IT",
  DEFAULT_COUNTRY: "IT",
  LAUNCH_REGION: "Calabria",
  LAUNCH_CITY: "Cosenza",
  SITTER_COMMISSION_PERCENT: 0.18,
  MEET_GREET_IS_FREE: true,
} as const;

export const PET_PHOTO_MAX_MB = 8;
export const VERIFICATION_DOCUMENT_MAX_MB = 12;
