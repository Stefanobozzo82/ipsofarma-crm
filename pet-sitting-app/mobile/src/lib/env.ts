/** Le variabili EXPO_PUBLIC_* sono inlineate da Expo a build time — niente
 * validazione Zod runtime come nel backend, ma un fallback esplicito e
 * rumoroso in dev è meglio di un URL "undefined" silenzioso. */
function readEnv(key: string, fallback: string): string {
  const value = process.env[key];
  if (!value && __DEV__) {
    console.warn(`[env] ${key} non impostata in .env — uso il fallback di sviluppo`);
  }
  return value ?? fallback;
}

export const env = {
  SUPABASE_URL: readEnv("EXPO_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co"),
  SUPABASE_ANON_KEY: readEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "changeme"),
  API_URL: readEnv("EXPO_PUBLIC_API_URL", "http://localhost:4000/api/v1"),
  STRIPE_PUBLISHABLE_KEY: readEnv("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY", ""),
};
