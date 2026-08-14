import { SERVICE_TYPE_LABELS_IT, type Booking } from "@fido/shared";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CalendarDays, Lock, MessageCircle, NotebookText, PawPrint } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, cancelBooking, getBooking, payBooking } from "@/lib/api";
import { BOOKING_STATUS_LABELS_IT, formatDateIt } from "@/lib/date";
import { env } from "@/lib/env";
import { getOrCreateConversation } from "@/features/chat/api";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/Button";
import { LoadingView } from "@/components/ui/LoadingView";

const CANCELLABLE_STATUSES = ["pending_request", "confirmed"];

// Caricato pigramente e una sola volta: come in mobile (stripe-react-native)
// la chiave pubblicabile è safe lato client, ma non ha senso caricare lo
// script Stripe.js per chi non paga mai (la stragrande maggioranza delle
// visite a questa pagina).
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!stripePromise) stripePromise = loadStripe(env.STRIPE_PUBLISHABLE_KEY);
  return stripePromise;
}

function SummaryRow({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className={emphasize ? "font-display text-lg font-extrabold text-accent" : "font-display font-bold text-ink"}>
        {value}
      </span>
    </div>
  );
}

/** Form di pagamento vero e proprio — separato dalla pagina perché va
 * montato solo dopo aver ottenuto il clientSecret (serve a <Elements>). */
function PaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        // "if_required": la maggior parte dei metodi (carta) resta su questa
        // pagina; solo i metodi che lo richiedono davvero (es. bonifici
        // istantanei) rimbalzano su return_url e tornano qui a pagamento fatto.
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (result.error) {
        setError(result.error.message ?? "Pagamento non riuscito. Riprova.");
        return;
      }
      onSuccess();
    } finally {
      setPaying(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="mt-4 flex flex-col gap-3">
      <PaymentElement />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={!stripe || paying}>
        {paying ? "Pagamento in corso…" : "Paga ora"}
      </Button>
      <div className="flex items-center justify-center gap-1.5">
        <Lock size={12} className="text-ink-faint" strokeWidth={2.25} />
        <span className="text-xs text-ink-faint">Pagamento sicuro gestito da Stripe</span>
      </div>
    </form>
  );
}

/** Porting web di mobile/app/booking/[id].tsx, limitato a ciò che il sito
 * copre oggi: riepilogo, cancellazione, pagamento, contatto col sitter.
 * Avvio/completamento servizio, tracking GPS e recensioni restano solo
 * nell'app (azioni lato sitter o post-servizio, fuori scope di questo giro). */
export function BookingStatusPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [preparingPayment, setPreparingPayment] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    getBooking(id)
      .then(setBooking)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Qualcosa è andato storto. Riprova."));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session) navigate("/accedi", { state: { from: `/prenotazioni/${id ?? ""}` } });
  }, [session, id, navigate]);

  if (!session) return <LoadingView />;
  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }
  if (!booking) return <LoadingView />;

  const isSitter = booking.sitterId === session.user.id;
  const canPay = booking.status === "confirmed" && booking.paymentStatus === "pending" && !isSitter;
  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);

  async function handlePreparePayment() {
    setPreparingPayment(true);
    setActionError(null);
    try {
      const { clientSecret: secret } = await payBooking(booking!.id);
      setClientSecret(secret);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Non siamo riusciti ad avviare il pagamento.");
    } finally {
      setPreparingPayment(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Sei sicuro di voler cancellare questa prenotazione?")) return;
    setCancelling(true);
    setActionError(null);
    try {
      const updated = await cancelBooking(booking!.id, {});
      setBooking(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Non siamo riusciti a cancellare la prenotazione.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleMessage() {
    setOpeningChat(true);
    setActionError(null);
    try {
      const conversation = await getOrCreateConversation(booking!.ownerId, booking!.sitterId);
      navigate(`/messaggi/${conversation.id}`);
    } catch {
      setActionError("Non siamo riusciti ad aprire la chat.");
    } finally {
      setOpeningChat(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold text-ink">La tua prenotazione</h1>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-display font-bold text-accent">
          {BOOKING_STATUS_LABELS_IT[booking.status] ?? booking.status}
        </span>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
            <PawPrint size={20} className="text-accent" strokeWidth={2} />
          </div>
          <span className="font-display font-bold text-ink">{SERVICE_TYPE_LABELS_IT[booking.serviceType]}</span>
        </div>

        <div className="flex items-start gap-3 border-b border-line py-4">
          <CalendarDays size={18} className="mt-0.5 shrink-0 text-ink-faint" strokeWidth={2} />
          <div className="text-sm text-ink-muted">
            <p>{formatDateIt(booking.startDate)}</p>
            {booking.endDate ? <p>fino al {formatDateIt(booking.endDate)}</p> : null}
            {booking.startTime ? (
              <p>
                {booking.startTime}
                {booking.endTime ? ` – ${booking.endTime}` : ""}
              </p>
            ) : null}
          </div>
        </div>

        {booking.notes ? (
          <div className="flex items-start gap-3 border-b border-line py-4">
            <NotebookText size={18} className="mt-0.5 shrink-0 text-ink-faint" strokeWidth={2} />
            <p className="text-sm text-ink-muted">{booking.notes}</p>
          </div>
        ) : null}

        <div className="pt-4">
          <SummaryRow
            label="Totale"
            value={`${(isSitter ? booking.sitterPayout : booking.priceTotal).toFixed(2)}€`}
            emphasize
          />
        </div>
      </div>

      {booking.status === "pending_request" && !isSitter ? (
        <p className="mt-4 text-center text-sm text-ink-faint">In attesa che il sitter confermi la richiesta</p>
      ) : null}

      {actionError ? <p className="mt-4 text-center text-sm text-danger">{actionError}</p> : null}

      <div className="mt-6 flex flex-col gap-3">
        {canPay && !clientSecret ? (
          <Button onClick={handlePreparePayment} disabled={preparingPayment}>
            {preparingPayment ? "Preparo il pagamento…" : "Paga ora"}
          </Button>
        ) : null}

        {canPay && clientSecret ? (
          <Elements stripe={getStripePromise()} options={{ clientSecret }}>
            <PaymentForm onSuccess={load} />
          </Elements>
        ) : null}

        <Button onClick={handleMessage} disabled={openingChat} variant="secondary" className="gap-2">
          <MessageCircle size={17} />
          {openingChat ? "Apro la chat…" : isSitter ? "Scrivi al proprietario" : "Scrivi al sitter"}
        </Button>

        {canCancel ? (
          <Button onClick={handleCancel} disabled={cancelling} variant="text">
            {cancelling ? "Annullo…" : "Annulla prenotazione"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
