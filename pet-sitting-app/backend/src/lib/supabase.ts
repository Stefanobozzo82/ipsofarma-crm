import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env";

/**
 * Client con service role key: bypassa RLS. Riservato a operazioni
 * privilegiate (trigger di sistema, webhook Stripe, moderazione admin) —
 * non usarlo mai per servire richieste utente generiche.
 */
export const supabaseAdmin: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Client "anonimo" per operazioni auth pubbliche (signUp, signInWithPassword,
 * signInWithIdToken, refreshSession) — non legato a un utente specifico.
 */
export const supabaseAnon: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Client scoped al JWT dell'utente chiamante: le query passano dalla RLS
 * come se fossero eseguite dall'utente stesso. È il client da preferire in
 * ogni handler autenticato — vedi middleware/auth.ts, che lo attacca a
 * req.supabase.
 */
export function createUserScopedClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
