import { PawPrint } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, applyAsSitter } from "@/lib/api";
import { geocodeAddress } from "@/lib/geocode";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";
import { LoadingView } from "@/components/ui/LoadingView";

/**
 * Porting web di mobile/app/sitter-onboarding/apply.tsx. Un'unica
 * differenza voluta: mobile prende lat/lng dal GPS del telefono
 * (getCurrentCoords), il sito non ha un equivalente affidabile in un form
 * — riusa lo stesso geocoding via Nominatim già usato da SearchForm
 * (indirizzo testuale → coordinate), niente di nuovo da introdurre.
 */
export function BecomeSitterPage() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();

  const [bio, setBio] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [address, setAddress] = useState("");
  const [serviceRadiusKm, setServiceRadiusKm] = useState("10");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (status === "signedOut") {
      navigate("/accedi", { state: { from: `${location.pathname}${location.search}` } });
    }
  }, [status, location, navigate]);

  if (status !== "signedIn") return <LoadingView />;

  const canSubmit = bio.trim().length >= 20 && address.trim().length >= 3 && experienceYears !== "";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
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
          Grazie — la rivediamo a mano e ti facciamo sapere appena viene approvata. Nel frattempo puoi già impostare
          quali servizi offri e a che tariffa: sarà tutto pronto appena il profilo viene attivato.
        </p>
        <Button to="/diventa-sitter/servizi" className="mt-2 w-full">
          Imposta servizi e tariffe
        </Button>
        <Button to="/account" variant="text">
          Vai al mio account
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-display text-2xl font-extrabold text-ink">Diventa un sitter</h1>
      <p className="mt-1 text-ink-muted">
        Raccontaci qualcosa di te — rivediamo ogni candidatura a mano prima di attivare il profilo.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-soft">
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
          />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button type="submit" disabled={!canSubmit || submitting} className="w-full">
          {submitting ? "Invio candidatura…" : "Invia candidatura"}
        </Button>
      </form>
    </div>
  );
}
