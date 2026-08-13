import { env } from "./env";
import { supabase } from "./supabase";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: { path: string; message: string }[];

  constructor(status: number, code: string, message: string, fields?: { path: string; message: string }[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Chi chiama con un DTO condiviso tipizzato (es. SearchSittersQuery)
   * deve passarlo con un cast esplicito a Record<string, unknown> — vedi
   * features/search/api.ts. I valori sono sempre String()-coercizzati in
   * buildUrl, quindi il cast è sicuro anche per numeri/enum. */
  query?: Record<string, unknown>;
  /** Solo per rotte davvero pubbliche (es. profilo sitter, ricerca):
   * salta il recupero del token, utile anche per chiamate pre-login. */
  auth?: boolean;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(`${env.API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Client HTTP verso il backend Express (Fasi 2-4): allega il JWT Supabase
 * dell'utente loggato e normalizza la busta { data } / { error } in un
 * ritorno tipizzato o in un ApiError, così le schermate non devono
 * conoscere la forma della risposta. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, auth = true } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Solo per test locali con un tunnel (localtunnel/loca.lt, usato per esporre
  // il backend in HTTPS a un device fisico quando la LAN/HTTP diretto non
  // basta — vedi mobile/README.md): senza questo header, loca.lt risponde con
  // una pagina HTML di avviso "Click to Continue" al posto della risposta
  // vera, e qui sotto response.json() la interpreta come errore di rete.
  // Innocuo in produzione: non fa nulla contro un dominio reale.
  if (env.API_URL.includes(".loca.lt")) headers["Bypass-Tunnel-Reminder"] = "true";
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const err = json?.error ?? { code: "unknown_error", message: "Errore di rete" };
    throw new ApiError(response.status, err.code, err.message, err.fields);
  }

  return (json?.data ?? json) as T;
}
