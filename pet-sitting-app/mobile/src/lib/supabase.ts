import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
// Supabase-js usa fetch/URL del runtime web; React Native non li implementa
// per intero senza questo polyfill (richiesto dalla guida ufficiale Supabase + RN).
import "react-native-url-polyfill/auto";
import { env } from "./env";

/**
 * Unico client Supabase dell'app, usato solo per auth (signUp/signIn/
 * signOut/sessione) e per i canali realtime nelle fasi successive (chat,
 * tracking GPS). Tutto il resto dei dati passa dal backend Express — vedi
 * lib/api.ts — che applica la logica di business (prezzo, Stripe, RLS via
 * client scoped) già scritta lì.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
