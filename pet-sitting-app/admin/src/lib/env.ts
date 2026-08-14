function readEnv(key: string, fallback: string): string {
  const value = import.meta.env[key];
  if (!value && import.meta.env.DEV) {
    console.warn(`[env] ${key} non impostata in .env — uso il fallback di sviluppo`);
  }
  return value ?? fallback;
}

export const env = {
  SUPABASE_URL: readEnv("VITE_SUPABASE_URL", "https://your-project.supabase.co"),
  SUPABASE_ANON_KEY: readEnv("VITE_SUPABASE_ANON_KEY", "changeme"),
  // Fallback al backend già deployato su Render — come in web/src/lib/env.ts,
  // così il pannello funziona "out of the box" una volta pubblicato, senza
  // richiedere VITE_API_URL: senza questo fallback, un deploy su Render senza
  // quella variabile impostata avrebbe provato a chiamare localhost:4000 dal
  // browser di chi apre il pannello — non dalla macchina di chi l'ha deployato,
  // fallendo per chiunque.
  API_URL: readEnv("VITE_API_URL", "https://fido-backend-ybvd.onrender.com/api/v1"),
};
