import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { services } from "@/data/services";

/** Stato controllato come richiesto, ma senza chiamata reale al backend —
 * il sito e l'app oggi non condividono ancora un layer dati (l'app parla
 * con Supabase via mobile/src/lib/api.ts). Quando si deciderà come
 * collegarli, questo handleSubmit sarà il punto in cui agganciare la vera
 * ricerca o il redirect all'app. */
export function SearchForm() {
  const [serviceId, setServiceId] = useState(services[0].id);
  const [location, setLocation] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // eslint-disable-next-line no-console
    console.log("Ricerca (non ancora collegata):", { serviceId, location });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-xl flex-col gap-3 rounded-2xl bg-surface p-3 shadow-lifted sm:flex-row sm:items-center sm:gap-2"
    >
      <select
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value as typeof serviceId)}
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
        placeholder="Indirizzo o città"
        aria-label="Indirizzo o città"
        className="w-full flex-1 rounded-xl border border-line bg-surface px-4 py-3 font-body text-ink outline-none placeholder:text-ink-faint focus:border-accent"
      />

      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 font-display font-bold text-accent-ink transition hover:bg-accent/90 active:scale-[0.97] sm:w-auto"
      >
        <Search size={18} strokeWidth={2.5} />
        Cerca
      </button>
    </form>
  );
}
