import type { SearchSittersQuery, SitterSearchResult } from "@fido/shared";
import { AppError } from "../../lib/app-error";
import { supabaseAnon } from "../../lib/supabase";
import { mapSearchResultRow } from "../sitters/sitters.mapper";

/** Ricerca pubblica: non richiede autenticazione, usa il client anon e la
 * funzione Postgres nearby_sitters() (SECURITY DEFINER, vedi la migrazione
 * 20260812130200) per il filtro geografico via PostGIS. */
export async function searchSitters(query: SearchSittersQuery): Promise<SitterSearchResult[]> {
  const { data, error } = await supabaseAnon.rpc("nearby_sitters", {
    p_lat: query.lat,
    p_lng: query.lng,
    p_service: query.service,
    p_radius_km: query.radiusKm,
    p_species: query.species ?? null,
    p_date: query.date ?? null,
    p_min_rating: query.minRating ?? null,
    p_max_price: query.maxPrice ?? null,
  });

  if (error) throw AppError.badRequest(`Ricerca non riuscita: ${error.message}`);
  return (data ?? []).map(mapSearchResultRow);
}
