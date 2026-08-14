import type { ServiceType } from "@fido/shared";
import { AlertCircle, Loader2, Search, SearchX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, searchSitters } from "@/lib/api";
import { services } from "@/data/services";
import { DEFAULT_COORDS, geocodeAddress } from "@/lib/geocode";
import { SitterResultCard } from "@/components/ui/SitterResultCard";
import type { SitterSearchResult } from "@fido/shared";

const RADIUS_KM = 15;

type Status = "idle" | "loading" | "error" | "done";

/**
 * Ricerca reale contro il backend (GET /search/sitters, pubblica, niente
 * login richiesto — vedi backend/src/modules/search/search.service.ts).
 * L'indirizzo digitato viene geocodificato lato client via Nominatim
 * (src/lib/geocode.ts) prima di chiamare il backend, che lavora solo con
 * lat/lng — esattamente come fa mobile/(tabs)/index.tsx con il GPS del
 * telefono al posto del testo libero.
 */
export function SearchForm() {
  const [serviceId, setServiceId] = useState<ServiceType>(services[0].id);
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SitterSearchResult[]>([]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      const coords = location.trim() ? await geocodeAddress(location) : DEFAULT_COORDS;
      if (!coords) {
        setStatus("error");
        setError(`Non troviamo "${location}" — prova con un indirizzo o una città diversi.`);
        return;
      }

      const data = await searchSitters({
        lat: coords.lat,
        lng: coords.lng,
        service: serviceId,
        radiusKm: RADIUS_KM,
      });
      setResults(data);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : "Qualcosa è andato storto. Riprova.");
    }
  }

  return (
    <div className="w-full max-w-xl">
      <form
        onSubmit={handleSubmit}
        className="flex w-full flex-col gap-3 rounded-2xl bg-surface p-3 shadow-lifted sm:flex-row sm:items-center sm:gap-2"
      >
        <select
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value as ServiceType)}
          aria-label="Tipo di servizio"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 font-body text-ink outline-none focus:border-accent sm:w-56"
        >
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Indirizzo o città (Cosenza se vuoto)"
          aria-label="Indirizzo o città"
          className="w-full flex-1 rounded-xl border border-line bg-surface px-4 py-3 font-body text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />

        <button
          type="submit"
          disabled={status === "loading"}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 font-display font-bold text-accent-ink transition hover:bg-accent/90 active:scale-[0.97] disabled:opacity-60 sm:w-auto"
        >
          {status === "loading" ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} strokeWidth={2.5} />}
          Cerca
        </button>
      </form>

      {status === "error" && error ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      ) : null}

      {status === "done" && (
        <div className="mt-4 flex flex-col gap-3">
          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-8 text-center">
              <SearchX size={28} className="text-ink-faint" strokeWidth={1.5} />
              <p className="text-sm text-ink-muted">
                Nessun sitter trovato in quest'area per questo servizio. Siamo ancora agli inizi a Cosenza e
                dintorni — prova un altro servizio o torna a trovarci presto.
              </p>
            </div>
          ) : (
            results.map((sitter) => <SitterResultCard key={sitter.sitterId} sitter={sitter} service={serviceId} />)
          )}
        </div>
      )}
    </div>
  );
}
