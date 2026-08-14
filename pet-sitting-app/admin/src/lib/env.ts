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
  API_URL: readEnv("VITE_API_URL", "http://localhost:4000/api/v1"),
};
