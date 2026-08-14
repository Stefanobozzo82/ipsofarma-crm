import type { SearchSittersQuery, SitterSearchResult } from "@fido/shared";
import { env } from "@/lib/env";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Solo la ricerca sitter per ora — l'unica chiamata reale che il sito fa
 * al backend. A differenza di mobile/lib/api.ts non serve gestire un
 * token: /search/sitters è pubblica (client anon lato backend, vedi
 * backend/src/modules/search/search.service.ts), niente sessione Supabase
 * da portarsi dietro qui. */
export async function searchSitters(query: SearchSittersQuery): Promise<SitterSearchResult[]> {
  const url = new URL(`${env.API_URL}/search/sitters`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString());
  const json = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, json?.error?.message ?? "Ricerca non riuscita");
  }

  return (json?.data ?? []) as SitterSearchResult[];
}
