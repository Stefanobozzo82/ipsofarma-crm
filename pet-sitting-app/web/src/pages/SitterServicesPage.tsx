import { PriceUnit, SERVICE_TYPE_LABELS_IT, ServiceType, type SitterService } from "@fido/shared";
import { PackageOpen, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, listMyServices, setMyServices } from "@/lib/api";
import { PRICE_UNIT_LABELS_IT } from "@/lib/date";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";
import { LoadingView } from "@/components/ui/LoadingView";

const SERVICE_OPTIONS = Object.values(ServiceType);
const UNIT_OPTIONS = Object.values(PriceUnit);
const DURATION_UNITS: PriceUnit[] = [PriceUnit.PerWalk, PriceUnit.PerVisit];

function ChipRow<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-4 py-2 text-sm font-display font-bold transition ${
              selected ? "border-accent bg-accent text-accent-ink" : "border-line bg-bg text-ink-muted"
            }`}
          >
            {labels[opt]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Porting web di mobile/app/sitter-dashboard/services.tsx: il listino
 * servizi/tariffe del sitter, PUT /sitters/me/services (sostituisce
 * l'intero listino, semantica "upsert lato client + salva tutto"). Prima
 * di questa pagina il sito lasciava candidarsi come sitter (/diventa-sitter)
 * ma non offriva alcun modo di impostare cosa e a quanto si offre.
 */
export function SitterServicesPage() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();

  const [services, setServices] = useState<SitterService[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState<ServiceType>(ServiceType.DogWalking);
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(PriceUnit.PerWalk);
  const [maxPets, setMaxPets] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (status === "signedOut") {
      navigate("/accedi", { state: { from: `${location.pathname}${location.search}` } });
    }
  }, [status, location, navigate]);

  useEffect(() => {
    if (status !== "signedIn") return;
    listMyServices()
      .then(setServices)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Qualcosa è andato storto. Riprova."));
  }, [status]);

  if (status !== "signedIn") return <LoadingView />;
  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }
  if (services === null) return <LoadingView />;

  async function persist(next: SitterService[]) {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await setMyServices(
        next.map((s) => ({
          serviceType: s.serviceType,
          price: s.price,
          priceUnit: s.priceUnit,
          durationMinutes: s.durationMinutes ?? undefined,
          maxPets: s.maxPets,
          isActive: s.isActive,
        })),
      );
      setServices(saved);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Non siamo riusciti a salvare il listino.");
    } finally {
      setSaving(false);
    }
  }

  function handleUpsert() {
    const priceValue = Number(price.replace(",", "."));
    if (!priceValue || priceValue <= 0) {
      setSaveError("Inserisci una tariffa valida");
      return;
    }
    const next: SitterService = {
      id: `local-${serviceType}`,
      sitterId: "",
      serviceType,
      price: priceValue,
      priceUnit,
      durationMinutes: DURATION_UNITS.includes(priceUnit) ? Number(durationMinutes) || null : null,
      maxPets: Number(maxPets) || 1,
      isActive,
    };
    persist([...(services ?? []).filter((s) => s.serviceType !== serviceType), next]);
  }

  function handleRemove(type: ServiceType) {
    persist((services ?? []).filter((s) => s.serviceType !== type));
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl font-extrabold text-ink">Il tuo listino</h1>
      <p className="mt-1 text-ink-muted">
        Quali servizi offri e a che tariffa — non comparirai in ricerca finché non ne aggiungi almeno uno.
      </p>

      {services.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-8 text-center">
          <PackageOpen size={28} className="text-ink-faint" strokeWidth={1.5} />
          <p className="text-sm text-ink-muted">
            Non hai ancora impostato nessun servizio: non comparirai in ricerca finché non ne aggiungi uno.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {services.map((s) => (
            <div key={s.id} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-ink">{SERVICE_TYPE_LABELS_IT[s.serviceType]}</span>
                <span className="font-display font-bold text-accent">
                  {s.price.toFixed(2)}€ {PRICE_UNIT_LABELS_IT[s.priceUnit] ?? ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(s.serviceType)}
                disabled={saving}
                className="mt-2 flex items-center gap-1 text-sm text-danger hover:text-danger/80"
              >
                <Trash2 size={13} strokeWidth={2.25} />
                Rimuovi
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <h2 className="font-display font-bold text-ink">Aggiungi/modifica servizio</h2>

        <ChipRow options={SERVICE_OPTIONS} value={serviceType} onChange={setServiceType} labels={SERVICE_TYPE_LABELS_IT} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-display font-bold text-ink">Tariffa (€)</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Es. 12"
            className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-display font-bold text-ink">Unità di tariffa</span>
          <ChipRow options={UNIT_OPTIONS} value={priceUnit} onChange={setPriceUnit} labels={PRICE_UNIT_LABELS_IT} />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-display font-bold text-ink">Numero massimo di animali</span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxPets}
            onChange={(e) => setMaxPets(e.target.value)}
            className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
          />
        </label>

        {DURATION_UNITS.includes(priceUnit) ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-display font-bold text-ink">Durata (minuti)</span>
            <input
              type="number"
              min={1}
              max={1440}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
            />
          </label>
        ) : null}

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span className="text-sm text-ink-muted">Attivo (visibile in ricerca)</span>
        </label>

        {saveError ? <p className="text-sm text-danger">{saveError}</p> : null}

        <Button onClick={handleUpsert} disabled={saving || !price} className="w-full">
          {saving ? "Salvo…" : "Salva"}
        </Button>
      </div>
    </div>
  );
}
