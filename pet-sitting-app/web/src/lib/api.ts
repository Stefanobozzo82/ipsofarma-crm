import type {
  Booking,
  CancelBookingInput,
  CreateBookingInput,
  CreatePetInput,
  Pet,
  PublicSitterProfile,
  Review,
  SearchSittersQuery,
  SitterSearchResult,
} from "@fido/shared";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, unknown>;
  /** Solo per rotte davvero pubbliche (ricerca, profilo sitter, recensioni):
   * salta il recupero del token, come in mobile/src/lib/api.ts. */
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

/** Client HTTP verso il backend Express — stesso pattern di mobile/src/lib/api.ts:
 * allega il JWT Supabase quando serve e normalizza la busta { data } / { error }
 * in un ritorno tipizzato o in un ApiError. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, auth = true } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
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
    throw new ApiError(response.status, json?.error?.message ?? "Qualcosa è andato storto. Riprova.");
  }

  return (json?.data ?? json) as T;
}

export function searchSitters(query: SearchSittersQuery): Promise<SitterSearchResult[]> {
  return apiFetch<SitterSearchResult[]>("/search/sitters", { query: query as Record<string, unknown>, auth: false });
}

export function getPublicSitterProfile(sitterId: string): Promise<PublicSitterProfile> {
  return apiFetch<PublicSitterProfile>(`/sitters/${sitterId}/public`, { auth: false });
}

export function listSitterReviews(sitterId: string): Promise<Review[]> {
  return apiFetch<Review[]>(`/sitters/${sitterId}/reviews`, { auth: false });
}

export function listMyPets(): Promise<Pet[]> {
  return apiFetch<Pet[]>("/pets");
}

export function createPet(input: CreatePetInput): Promise<Pet> {
  return apiFetch<Pet>("/pets", { method: "POST", body: input });
}

export function createBooking(input: CreateBookingInput): Promise<Booking> {
  return apiFetch<Booking>("/bookings", { method: "POST", body: input });
}

export function getBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}`);
}

export function cancelBooking(id: string, input: CancelBookingInput): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/cancel`, { method: "PATCH", body: input });
}

export function payBooking(id: string): Promise<{ clientSecret: string }> {
  return apiFetch<{ clientSecret: string }>(`/bookings/${id}/pay`, { method: "POST" });
}
