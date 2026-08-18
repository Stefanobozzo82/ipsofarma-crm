import type { SitterServiceInput } from "@fido/shared";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, listMyServices, setMyServices } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";
import { LoadingView } from "@/components/ui/LoadingView";
import { ServiceListingEditor } from "@/components/sitters/ServiceListingEditor";

/**
 * Gestione del listino servizi/tariffe per chi è già candidato come sitter
 * (porting web di mobile/app/sitter-dashboard/services.tsx) — ogni
 * aggiunta/rimozione salva subito via PUT /sitters/me/services, a
 * differenza della stessa UI dentro BecomeSitterPage (dove il listino resta
 * solo in memoria fino all'invio della candidatura, vedi quel file).
 */
export function SitterServicesPage() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const location = useLocation();

  const [services, setServices] = useState<SitterServiceInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signedOut") {
      navigate("/accedi", { state: { from: `${location.pathname}${location.search}` } });
    }
  }, [status, location, navigate]);

  useEffect(() => {
    if (status !== "signedIn") return;
    listMyServices()
      .then((data) =>
        setServices(
          data.map((s) => ({
            serviceType: s.serviceType,
            price: s.price,
            priceUnit: s.priceUnit,
            durationMinutes: s.durationMinutes ?? undefined,
            maxPets: s.maxPets,
            isActive: s.isActive,
          })),
        ),
      )
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

  async function handleChange(next: SitterServiceInput[]) {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await setMyServices(next);
      setServices(
        saved.map((s) => ({
          serviceType: s.serviceType,
          price: s.price,
          priceUnit: s.priceUnit,
          durationMinutes: s.durationMinutes ?? undefined,
          maxPets: s.maxPets,
          isActive: s.isActive,
        })),
      );
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Non siamo riusciti a salvare il listino.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl font-extrabold text-ink">Il tuo listino</h1>
      <p className="mt-1 text-ink-muted">
        Quali servizi offri e a che tariffa — non comparirai in ricerca finché non ne aggiungi almeno uno.
      </p>

      {saveError ? <p className="mt-4 text-sm text-danger">{saveError}</p> : null}

      <div className="mt-6">
        <ServiceListingEditor items={services} onChange={handleChange} disabled={saving} addLabel={saving ? "Salvo…" : "Salva"} />
      </div>
    </div>
  );
}
