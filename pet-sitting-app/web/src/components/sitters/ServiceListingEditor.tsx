import { PriceUnit, SERVICE_TYPE_LABELS_IT, ServiceType, type SitterServiceInput } from "@fido/shared";
import { PackageOpen, Trash2 } from "lucide-react";
import { useState } from "react";
import { PRICE_UNIT_LABELS_IT } from "@/lib/date";
import { Button } from "@/components/ui/Button";
import { ChipRow } from "@/components/ui/ChipRow";

const SERVICE_OPTIONS = Object.values(ServiceType);
const UNIT_OPTIONS = Object.values(PriceUnit);
const DURATION_UNITS: PriceUnit[] = [PriceUnit.PerWalk, PriceUnit.PerVisit];

interface ServiceListingEditorProps {
  items: SitterServiceInput[];
  onChange: (items: SitterServiceInput[]) => void;
  disabled?: boolean;
  /** Testo del pulsante "aggiungi" — diverso a seconda di dove è montato
   * (SitterServicesPage salva subito via API, BecomeSitterPage tiene la
   * lista solo in memoria fino all'invio della candidatura). */
  addLabel?: string;
  emptyHint?: string;
}

/**
 * Editor del listino servizi/tariffe — condiviso tra `SitterServicesPage`
 * (dove ogni modifica chiama subito `PUT /sitters/me/services` tramite
 * `onChange`) e `BecomeSitterPage` (dove `onChange` aggiorna solo uno stato
 * locale, salvato sul backend una volta sola all'invio della candidatura).
 * Nessuna chiamata di rete qui dentro: puramente controllato dal genitore.
 */
export function ServiceListingEditor({
  items,
  onChange,
  disabled = false,
  addLabel = "Aggiungi",
  emptyHint = "Non hai ancora impostato nessun servizio: non comparirai in ricerca finché non ne aggiungi uno.",
}: ServiceListingEditorProps) {
  const [serviceType, setServiceType] = useState<ServiceType>(ServiceType.DogWalking);
  const [price, setPrice] = useState("");
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(PriceUnit.PerWalk);
  const [maxPets, setMaxPets] = useState("1");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  function handleAdd() {
    const priceValue = Number(price.replace(",", "."));
    if (!priceValue || priceValue <= 0) {
      setFormError("Inserisci una tariffa valida");
      return;
    }
    setFormError(null);
    const next: SitterServiceInput = {
      serviceType,
      price: priceValue,
      priceUnit,
      durationMinutes: DURATION_UNITS.includes(priceUnit) ? Number(durationMinutes) || undefined : undefined,
      maxPets: Number(maxPets) || 1,
      isActive,
    };
    onChange([...items.filter((s) => s.serviceType !== serviceType), next]);
    setPrice("");
  }

  function handleRemove(type: ServiceType) {
    onChange(items.filter((s) => s.serviceType !== type));
  }

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-8 text-center">
          <PackageOpen size={28} className="text-ink-faint" strokeWidth={1.5} />
          <p className="text-sm text-ink-muted">{emptyHint}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((s) => (
            <div key={s.serviceType} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-ink">{SERVICE_TYPE_LABELS_IT[s.serviceType]}</span>
                <span className="font-display font-bold text-accent">
                  {s.price.toFixed(2)}€ {PRICE_UNIT_LABELS_IT[s.priceUnit] ?? ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(s.serviceType)}
                disabled={disabled}
                className="mt-2 flex items-center gap-1 text-sm text-danger hover:text-danger/80"
              >
                <Trash2 size={13} strokeWidth={2.25} />
                Rimuovi
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-soft">
        <h3 className="font-display font-bold text-ink">Aggiungi/modifica servizio</h3>

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

        {formError ? <p className="text-sm text-danger">{formError}</p> : null}

        <Button type="button" onClick={handleAdd} disabled={disabled || !price} variant="secondary" className="w-full">
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
