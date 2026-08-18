export interface Coords {
  lat: number;
  lng: number;
}

/** Centro di Cosenza — stessa costante di mobile/src/lib/location.ts
 * (lì con nomi latitude/longitude, qui lat/lng per combaciare con
 * SearchSittersQuery). Città del lancio pilota: un fallback sensato
 * quando il campo indirizzo è vuoto o non si trova nulla. */
export const DEFAULT_COORDS: Coords = { lat: 39.3057, lng: 16.2503 };

/**
 * Geocoding via Nominatim (OpenStreetMap), l'unico geocoder gratuito senza
 * bisogno di una chiave API/account — a differenza di Google/Mapbox, che
 * richiederebbero all'utente di attivare fatturazione solo per una casella
 * di ricerca. Va bene per il volume di traffico di un sito in lancio; se il
 * traffico crescesse molto, la policy di Nominatim (max 1 richiesta/sec,
 * uso "leggero") suggerirebbe di passare a un provider a pagamento o a
 * un'istanza self-hosted — vedi web/README.md.
 */
export async function geocodeAddress(query: string): Promise<Coords | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "it");

  const response = await fetch(url.toString());
  if (!response.ok) return null;

  const results = (await response.json()) as { lat: string; lon: string }[];
  if (results.length === 0) return null;

  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}
