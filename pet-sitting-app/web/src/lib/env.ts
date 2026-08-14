/** Le variabili VITE_* sono inlineate da Vite a build time (import.meta.env).
 * Fallback al backend già deployato su Render — così il sito funziona
 * "out of the box" senza richiedere un .env locale, a differenza di
 * mobile/admin che parlano sempre con un backend scelto esplicitamente. */
export const env = {
  API_URL: import.meta.env.VITE_API_URL ?? "https://fido-backend-ybvd.onrender.com/api/v1",
};
