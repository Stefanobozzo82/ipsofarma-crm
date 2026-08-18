import { SERVICE_TYPE_LABELS_IT, type PublicSitterProfile, type Review } from "@fido/shared";
import { BadgeCheck, MessageCircle, PawPrint, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, getPublicSitterProfile, listSitterReviews } from "@/lib/api";
import { PRICE_UNIT_LABELS_IT } from "@/lib/date";
import { getOrCreateConversation } from "@/features/chat/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";
import { LoadingView } from "@/components/ui/LoadingView";

function Avatar({ profile }: { profile: PublicSitterProfile }) {
  if (profile.avatarUrl) {
    return <img src={profile.avatarUrl} alt="" className="h-24 w-24 rounded-2xl object-cover" />;
  }
  return (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-accent">
      <span className="font-display text-3xl font-bold text-accent-ink">{profile.firstName.charAt(0).toUpperCase()}</span>
    </div>
  );
}

/**
 * Scheda pubblica del sitter — quello che manca oggi cliccando su una card
 * dei risultati di ricerca (vedi SitterResultCard). Dati pubblici, nessun
 * login richiesto per vederla; login richiesto solo per messaggiare o
 * prenotare (vedi i due bottoni sotto).
 */
export function SitterProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const highlightedService = searchParams.get("service");
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);

  const [profile, setProfile] = useState<PublicSitterProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openingChat, setOpeningChat] = useState(false);

  useEffect(() => {
    if (!id) return;
    setProfile(null);
    setError(null);
    Promise.all([getPublicSitterProfile(id), listSitterReviews(id)])
      .then(([profileData, reviewsData]) => {
        setProfile(profileData);
        setReviews(reviewsData);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Qualcosa è andato storto. Riprova."));
  }, [id]);

  function requireAuth(): boolean {
    if (status === "signedIn") return true;
    navigate("/accedi", { state: { from: `${location.pathname}${location.search}` } });
    return false;
  }

  async function handleMessage() {
    if (!id || !requireAuth() || !session) return;
    setOpeningChat(true);
    try {
      const conversation = await getOrCreateConversation(session.user.id, id);
      navigate(`/messaggi/${conversation.id}`);
    } catch {
      setError("Non siamo riusciti ad aprire la chat. Riprova.");
    } finally {
      setOpeningChat(false);
    }
  }

  function handleBook(serviceType: string) {
    if (!id || !requireAuth()) return;
    navigate(`/sitters/${id}/prenota?service=${serviceType}`);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-danger">{error}</p>
        <Button to="/" variant="secondary" className="mt-4">
          Torna alla ricerca
        </Button>
      </div>
    );
  }
  if (!profile) return <LoadingView />;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-col gap-6 rounded-3xl border border-line bg-surface p-6 shadow-soft sm:flex-row sm:items-center">
        <Avatar profile={profile} />

        <div className="flex-1">
          <h1 className="font-display text-2xl font-extrabold text-ink">{profile.firstName}</h1>
          {profile.city ? <p className="text-sm text-ink-muted">{profile.city}</p> : null}

          <div className="mt-1 flex items-center gap-1.5">
            <BadgeCheck size={15} className="text-success" strokeWidth={2.25} />
            <span className="text-xs font-display font-bold text-success">Sitter verificato</span>
          </div>

          {profile.reviewCount > 0 ? (
            <div className="mt-2 flex items-center gap-1">
              <div className="flex text-amber">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    fill={i < Math.round(profile.averageRating ?? 0) ? "currentColor" : "none"}
                    strokeWidth={1.5}
                  />
                ))}
              </div>
              <span className="text-sm text-ink-faint">
                {profile.averageRating?.toFixed(1)} · {profile.reviewCount} recensioni
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-faint">Nessuna recensione ancora</p>
          )}

          {profile.experienceYears ? (
            <p className="mt-1 text-sm text-ink-muted">{profile.experienceYears} anni di esperienza</p>
          ) : null}
        </div>

        <Button onClick={handleMessage} disabled={openingChat} variant="secondary" className="shrink-0 gap-2">
          <MessageCircle size={17} />
          {openingChat ? "Apro la chat…" : "Scrivi un messaggio"}
        </Button>
      </div>

      {profile.bio ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-ink">Chi è {profile.firstName}</h2>
          <p className="mt-2 whitespace-pre-line text-ink-muted">{profile.bio}</p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-ink">Servizi offerti</h2>
        <div className="mt-3 flex flex-col gap-3">
          {profile.services.length === 0 ? (
            <p className="text-sm text-ink-faint">Nessun servizio ancora pubblicato.</p>
          ) : (
            profile.services.map((service) => (
              <div
                key={service.id}
                className={`flex items-center gap-4 rounded-2xl border p-4 ${
                  highlightedService === service.serviceType ? "border-accent bg-accent-soft/40" : "border-line bg-surface"
                }`}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                  <PawPrint size={20} className="text-accent" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="font-display font-bold text-ink">{SERVICE_TYPE_LABELS_IT[service.serviceType]}</p>
                  <p className="text-sm text-ink-faint">
                    {service.price.toFixed(0)}€ {PRICE_UNIT_LABELS_IT[service.priceUnit] ?? ""}
                  </p>
                </div>
                <Button onClick={() => handleBook(service.serviceType)} variant="primary">
                  Prenota
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-ink">Recensioni</h2>
        {reviews.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">Nessuna recensione ancora.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-ink">{review.reviewerFirstName}</span>
                  <div className="flex text-amber">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={13} fill={i < review.rating ? "currentColor" : "none"} strokeWidth={1.5} />
                    ))}
                  </div>
                </div>
                {review.comment ? <p className="mt-1 text-sm text-ink-muted">{review.comment}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-8 text-center text-sm text-ink-faint">
        Non trovi quello che cerchi?{" "}
        <Link to="/" className="font-display font-bold text-accent">
          Torna alla ricerca
        </Link>
      </p>
    </div>
  );
}
