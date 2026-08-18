import { env } from "./env";
import { supabase } from "./supabase";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, unknown>;
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

/** Stesso pattern di mobile/src/lib/api.ts: allega il JWT Supabase
 * dell'admin loggato, normalizza la busta { data } / { error } del backend. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = options;

  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const err = json?.error ?? { code: "unknown_error", message: "Errore di rete" };
    throw new ApiError(response.status, err.code, err.message);
  }

  return (json?.data ?? json) as T;
}
