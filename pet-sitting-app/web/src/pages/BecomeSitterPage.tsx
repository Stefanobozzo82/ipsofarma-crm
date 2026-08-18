import type { SitterServiceInput } from "@fido/shared";
import { PawPrint } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, applyAsSitter, setMyServices } from "@/lib/api";
import { geocodeAddress } from "@/lib/geocode";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";
import { LoadingView } from "@/components/ui/LoadingView";
import { ServiceListingEditor } from "@/components/sitters/ServiceListingEditor";

/**
 * Porting web di mobile/app/sitter-onboarding/apply.tsx, esteso su
 * richiesta esplicita: a differenza di mobile (dove il listino si imposta
 * dopo, dalla dashboard sitter), qui il listino servizi/tariffe è raccolto
 * nello stesso form e fa parte dello stesso invio — non si può mandare la
 * candidatura senza aver già scelto almeno un servizio e una tariffa.
 *
 * Sotto il cofano restano comunque due chiamate separate in sequenza
 * (POST /sitters/apply, poi PUT /sitters/me/services): il vincolo è nel
 * database, sitter_services.sitter_id referenzia sitter_profiles.user_id,
 * quindi il profilo deve esistere prima che si possa salvare un listino.
 * Se la prima riesce ma la seconda fallisce (rete), non si ritenta la
 * candidatura (andrebbe in conflitto — esiste già) ma solo il salvataggio
 * del listino: applied tiene traccia di questo stato intermedio.
 */
export function BecomeSitterPage() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();

  const [bio, setBio] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [address, setAddress] = useState("");
  const [serviceRadiusKm, setServiceRadiusKm] = useState("10");
  const [services, setServices] = useState<SitterServiceInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (status === "signedOut") {
      navigate("/accedi", { state: { from: `${location.pathname}${location.search}` } });
    }
  }, [status, location, navigate]);

  if (status !== "signedIn") return <LoadingView />;

  const missingReasons = [
    bio.trim().length < 20 ? "una descrizione di almeno 20 caratteri" : null,
    experienceYears === "" ? "gli anni di esperienza" : null,
    address.trim().length < 3 ? "un indirizzo o città" : null,
    services.length === 0 ? "almeno un servizio con la sua tariffa" : null,
  ].filter((reason): reason is string => reason !== null);
  const canSubmit = missingReasons.length === 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!applied) {
        const coords = await geocodeAddress(address);
        if (!coords) {
          setError(`Non troviamo "${address}" — prova con un indirizzo o una città diversi.`);
          return;
        }
        await applyAsSitter({
          bio: bio.trim(),
          experienceYears: Number(experienceYears) || 0,
          address: address.trim(),
          latitude: coords.lat,
          longitude: coords.lng,
          serviceRadiusKm: Number(serviceRadiusKm) || 10,
        });
        setApplied(true);
      }
      await setMyServices(services);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Qualcosa è andato storto. Riprova.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
          <PawPrint size={28} className="text-accent" strokeWidth={2} />
        </div>
        <h1 className="font-display text-2xl font-extrabold text-ink">Candidatura inviata!</h1>
        <p className="text-ink-muted">
          Grazie — la rivediamo a mano e ti facciamo sapere appena viene approvata. Servizi e tariffe sono già
          salvati, pronti per quando il profilo verrà attivato.
        </p>
        <Button to="/account" variant="secondary" className="mt-2">
          Vai al mio account
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-display text-2xl font-extrabold text-ink">Diventa un sitter</h1>
      <p className="mt-1 text-ink-muted">
        Raccontaci qualcosa di te e cosa offri — rivediamo ogni candidatura a mano prima di attivare il profilo.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-soft">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-display font-bold text-ink">Parlaci di te</span>
            <textarea
              required
              minLength={20}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={5}
              placeholder="Esperienza con gli animali, perché vuoi fare il sitter, come lavori..."
              className="resize-none rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
              disabled={applied}
            />
            <span className="text-xs text-ink-faint">Almeno 20 caratteri ({bio.trim().length}/20)</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-display font-bold text-ink">Anni di esperienza con gli animali</span>
            <input
              type="number"
              required
              min={0}
              max={60}
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
              disabled={applied}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-display font-bold text-ink">Indirizzo o città</span>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dove offri il servizio"
              className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
              disabled={applied}
            />
            <span className="text-xs text-ink-faint">Usato solo per mostrarti ai proprietari vicini a te</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-display font-bold text-ink">Raggio di servizio (km)</span>
            <input
              type="number"
              required
              min={1}
              max={50}
              value={serviceRadiusKm}
              onChange={(e) => setServiceRadiusKm(e.target.value)}
              className="rounded-xl border border-line bg-bg px-4 py-2.5 text-ink outline-none focus:border-accent"
              disabled={applied}
            />
          </label>
        </div>

        <div>
          <h2 className="font-display font-bold text-ink">I tuoi servizi e tariffe</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Aggiungi almeno un servizio prima di poter inviare la candidatura — è quello che i proprietari vedranno
            in ricerca.
          </p>
          <div className="mt-4">
            <ServiceListingEditor items={services} onChange={setServices} disabled={submitting} />
          </div>
        </div>

        {error ? (
          <p className="text-sm text-danger">
            {error}
            {applied ? " I tuoi dati sono già salvati — riprova solo a salvare il listino." : ""}
          </p>
        ) : null}

        <Button type="submit" disabled={!canSubmit || submitting} className="w-full">
          {submitting ? "Invio candidatura…" : applied ? "Riprova a salvare il listino" : "Invia candidatura"}
        </Button>
        {!canSubmit && !applied ? (
          <p className="text-center text-xs text-ink-faint">Manca ancora: {missingReasons.join(", ")}</p>
        ) : null}
      </form>
    </div>
  );
}
