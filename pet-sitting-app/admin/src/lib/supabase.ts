import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/** Client Supabase solo per l'auth (login email/password, sessione) — come
 * nel mobile, il resto dei dati passa dal backend Express. In un browser
 * non servono polyfill: localStorage/fetch sono nativi. */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
