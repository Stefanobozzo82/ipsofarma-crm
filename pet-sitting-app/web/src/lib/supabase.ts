import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/** Client Supabase solo per l'auth (signUp/signIn/sessione), come in
 * mobile/admin — il resto dei dati passa dal backend Express. In un
 * browser non servono polyfill: localStorage/fetch sono nativi. */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
