import {
  PetSpecies,
  PriceUnit,
  SERVICE_TYPE_LABELS_IT,
  type Pet,
  type PublicSitterProfile,
} from "@fido/shared";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, createBooking, createPet, getPublicSitterProfile, listMyPets } from "@/lib/api";
import { toDateString } from "@/lib/date";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";
import { LoadingView } from "@/components/ui/LoadingView";

const NEEDS_END_DATE: PriceUnit[] = [PriceUnit.PerNight];
const OPTIONAL_END_DATE: PriceUnit[] = [PriceUnit.PerDay];
const NEEDS_TIME_RANGE: PriceUnit[] = [PriceUnit.PerHour];

const SPECIES_LABELS: Record<string, string> = { dog: "Cane", cat: "Gatto", other: "Altro" };

/** Form minimo per aggiungere un animale senza uscire dal flusso di
 * prenotazione — il sito non ha (ancora) una pagina "I miei animali" come
 * mobile/app/pets/index.tsx, quindi qui il form copre solo i campi
 * obbligatori (nome + specie) invece di replicare l'intera gestione. */
function AddPetInlineForm({ onAdded }: { onAdded: (pet: Pet) => void }) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<PetSpecies>(PetSpecies.Dog);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const pet = await createPet({ name: name.trim(), species });
      setName("");
      onAdded(pet);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Non siamo riusciti ad aggiungere l'animale.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-dashed border-line p-4 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1.5">
        <span className="text-xs font-display font-bold text-ink-faint">Nome animale</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Fido"
          className="rounded-xl border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-display font-bold text-ink-faint">Specie</span>
        <select
          value={species}
          onChange={(e) => setSpecies(e.target.value as PetSpecies)}
          className="rounded-xl border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent"
        >
          {Object.values(PetSpecies).map((s) => (
            <option key={s} value={s}>
              {SPECIES_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" disabled={submitting || !name.trim()}>
        {submitting ? "Aggiungo…" : "Aggiungi"}
      </Button>
      {error ? <p className="text-sm text-danger sm:basis-full">{error}</p> : null}
    </form>
  );
}

/**
 * Porting web di mobile/app/booking/new.tsx: seleziona animali, date/orari
 * secondo la tariffa del servizio, invia POST /bookings, poi va allo stato
 * della prenotazione dove si trova anche il pagamento.
 */
export function BookingNewPage() {
  const { id: sitterId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const serviceType = searchParams.get("service");
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);

  const [pets, setPets] = useState<Pet[] | null>(null);
  const [sitterProfile, setSitterProfile] = useState<PublicSitterProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(toDateString(new Date()));
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!sitterId) return;
    Promise.all([listMyPets(), getPublicSitterProfile(sitterId)])
      .then(([petsData, profile]) => {
        setPets(petsData);
        setSitterProfile(profile);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Qualcosa è andato storto. Riprova."));
  }, [sitterId]);

  // Guardia coerente con SitterProfilePage: si arriva qui solo passando da
  // "Prenota", che già reindirizza al login se serve — questo copre solo
  // l'accesso diretto all'URL (refresh, link condiviso...). In un effect,
  // non durante il render, per non innescare un altro render mentre questo
  // è ancora in corso.
  useEffect(() => {
    if (!session) {
      navigate("/accedi", { state: { from: `/sitters/${sitterId}/prenota?service=${serviceType ?? ""}` } });
    }
  }, [session, sitterId, serviceType, navigate]);

  if (!session) return <LoadingView />;

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }
  if (!pets || !sitterProfile || !sitterId) return <LoadingView />;

  const selectedService = sitterProfile.services.find((s) => s.serviceType === serviceType);
  if (!selectedService) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-danger">Questo servizio non è più disponibile per questo sitter.</p>
        <Button to={`/sitters/${sitterId}`} variant="secondary" className="mt-4">
          Torna alla scheda del sitter
        </Button>
      </div>
    );
  }

  const priceUnit = selectedService.priceUnit;
  const showEndDate = NEEDS_END_DATE.includes(priceUnit) || OPTIONAL_END_DATE.includes(priceUnit);
  const endDateRequired = NEEDS_END_DATE.includes(priceUnit);
  const showTimeRange = NEEDS_TIME_RANGE.includes(priceUnit);

  function togglePet(petId: string) {
    setSelectedPetIds((prev) => (prev.includes(petId) ? prev.filter((pid) => pid !== petId) : [...prev, petId]));
  }

  const canSubmit = selectedPetIds.length > 0 && (!endDateRequired || endDate !== "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const booking = await createBooking({
        sitterId: sitterId!,
        serviceType: selectedService!.serviceType,
        petIds: selectedPetIds,
        startDate,
        endDate: showEndDate && endDate ? endDate : undefined,
        startTime: showTimeRange ? startTime : undefined,
        endTime: showTimeRange ? endTime : undefined,
        notes: notes.trim() || undefined,
      });
      navigate(`/prenotazioni/${booking.id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Qualcosa è andato storto. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl font-extrabold text-ink">Nuova prenotazione</h1>

      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <div className="flex-1">
          <p className="text-xs font-display font-bold uppercase tracking-wide text-ink-faint">
            {SERVICE_TYPE_LABELS_IT[selectedService.serviceType]}
          </p>
          <p className="font-display font-bold text-ink">Con {sitterProfile.firstName}</p>
        </div>
        <p className="font-display text-lg font-extrabold text-accent">{selectedService.price.toFixed(0)}€</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <h2 className="font-display font-bold text-ink">Animali coinvolti</h2>

          {pets.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">Aggiungi almeno un animale per procedere.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {pets.map((pet) => {
                const selected = selectedPetIds.includes(pet.id);
                return (
                  <button
                    key={pet.id}
                    type="button"
                    onClick={() => togglePet(pet.id)}
                    className={`rounded-full border px-4 py-2 text-sm font-display font-bold transition ${
                      selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-bg text-ink-muted"
                    }`}
                  >
                    {pet.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4">
            <AddPetInlineForm onAdded={(pet) => setPets((prev) => [...(prev ?? []), pet])} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-display font-bold text-ink">Data di inizio</span>
              <input
                type="date"
                required
                min={toDateString(new Date())}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-accent"
              />
            </label>

            {showEndDate ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-display font-bold text-ink">
                  Data di fine{endDateRequired ? "" : " (opzionale)"}
                </span>
                <input
                  type="date"
                  required={endDateRequired}
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-accent"
                />
              </label>
            ) : null}

            {showTimeRange ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-display font-bold text-ink">Dalle</span>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="rounded-xl border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-display font-bold text-ink">Alle</span>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="rounded-xl border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-accent"
                  />
                </label>
              </>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-display font-bold text-ink">Note per il sitter (opzionale)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none rounded-xl border border-line bg-bg px-3 py-2.5 text-ink outline-none focus:border-accent"
            />
          </label>
        </section>

        {submitError ? <p className="text-sm text-danger">{submitError}</p> : null}

        <Button type="submit" disabled={!canSubmit || submitting} className="w-full">
          {submitting ? "Invio richiesta…" : "Invia richiesta"}
        </Button>
      </form>
    </div>
  );
}
