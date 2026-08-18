/** Le variabili VITE_* sono inlineate da Vite a build time (import.meta.env).
 * Fallback al backend già deployato su Render — così il sito funziona
 * "out of the box" senza richiedere un .env locale, a differenza di
 * mobile/admin che parlano sempre con un backend scelto esplicitamente.
 * SUPABASE_URL/ANON_KEY invece non hanno un fallback sensato (sono legati
 * al progetto reale, diverso per ciascuno): senza vanno impostati su
 * Render come variabili d'ambiente del sito — vedi web/README.md. */
export const env = {
  API_URL: import.meta.env.VITE_API_URL ?? "https://fido-backend-ybvd.onrender.com/api/v1",
  // "" farebbe crashare createClient() nel modulo lib/supabase.ts ("supabaseUrl
  // is required") — non solo le pagine di login, tutto il sito: quel modulo
  // si importa da store/auth-store.ts, usato anche solo per leggere lo stato
  // (Header). Un URL sintatticamente valido ma inesistente lascia il client
  // costruirsi senza errori; se le variabili vere mancano davvero, a fallire
  // sarà solo la singola chiamata di login/signup quando viene invocata (un
  // errore di rete gestito, non un crash dell'intera pagina).
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key",
  // Chiave pubblicabile Stripe (safe da esporre lato client, come su mobile:
  // vedi mobile/src/lib/env.ts). Senza, il pulsante "Paga" in
  // BookingStatusPage fallisce con un errore gestito, non un crash del sito.
  STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "",
};
