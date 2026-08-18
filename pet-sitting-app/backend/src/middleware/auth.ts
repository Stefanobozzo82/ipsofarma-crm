import type { NextFunction, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../lib/app-error";
import { createUserScopedClient, supabaseAnon } from "../lib/supabase";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Utente autenticato (dal JWT Supabase) — presente solo dopo requireAuth. */
      user?: { id: string; email: string | undefined };
      /** Client Supabase con il JWT dell'utente: le query rispettano la RLS
       * come se fossero eseguite dall'utente stesso. Preferire sempre questo
       * a supabaseAdmin negli handler autenticati. */
      supabase?: SupabaseClient;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/** Verifica il JWT Supabase nell'header Authorization e popola req.user /
 * req.supabase. Da usare su ogni rotta che richiede un utente autenticato. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req);
    if (!token) throw AppError.unauthorized("Token di autenticazione mancante");

    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (error || !data.user) {
      throw AppError.unauthorized("Sessione non valida o scaduta");
    }

    req.user = { id: data.user.id, email: data.user.email };
    req.supabase = createUserScopedClient(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** Da comporre dopo requireAuth: consente l'accesso solo agli utenti con
 * role = 'admin' su public.users. */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user || !req.supabase) throw AppError.unauthorized();

    const { data, error } = await req.supabase.from("users").select("role").eq("id", req.user.id).single();
    if (error || data?.role !== "admin") {
      throw AppError.forbidden("Richiesti privilegi di amministratore");
    }
    next();
  } catch (err) {
    next(err);
  }
}
