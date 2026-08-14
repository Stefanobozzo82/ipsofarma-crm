import type { SearchSittersQuery, SitterSearchResult } from "@fido/shared";
import { apiFetch } from "@/lib/api";

export function searchSitters(query: SearchSittersQuery): Promise<SitterSearchResult[]> {
  return apiFetch<SitterSearchResult[]>("/search/sitters", {
    query: query as unknown as Record<string, unknown>,
    auth: false,
  });
}
