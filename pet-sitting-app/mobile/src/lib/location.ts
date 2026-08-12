import * as Location from "expo-location";

/** Centro di Cosenza — città del lancio pilota (docs/PHASE1-PROPOSAL.md).
 * Fallback quando l'utente nega il permesso di geolocalizzazione o è su
 * simulatore senza posizione impostata: la ricerca resta comunque utile. */
export const DEFAULT_COORDS = { latitude: 39.3057, longitude: 16.2503 };

export interface Coords {
  latitude: number;
  longitude: number;
}

/** Richiede il permesso solo se non già concesso/negato in modo permanente;
 * ritorna sempre coordinate valide (mai null) così i chiamanti non devono
 * gestire lo stato "nessuna posizione". */
export async function getCurrentCoords(): Promise<Coords> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return DEFAULT_COORDS;

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return DEFAULT_COORDS;
  }
}
