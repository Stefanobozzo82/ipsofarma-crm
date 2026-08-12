import {
  CANCELLATION_RULES,
  type Booking,
  type CancelBookingInput,
  type CancellationPolicyType,
  type CreateBookingInput,
  type DeclineBookingInput,
} from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { getStripe } from "../../lib/stripe";
import { supabaseAdmin } from "../../lib/supabase";
import { mapBookingRow } from "./booking.mapper";
import { computeBreakdown, computeQuantity } from "./booking.pricing";

const BOOKING_COLUMNS =
  "id, owner_id, sitter_id, service_type, status, start_date, end_date, start_time, end_time, quantity, unit_price, price_unit, price_total, platform_fee, sitter_payout, currency, payment_status, stripe_payment_intent_id, cancellation_policy, notes, cancelled_at, cancelled_by, cancellation_reason, created_at, updated_at";

async function fetchPetIds(supabase: SupabaseClient, bookingId: string): Promise<string[]> {
  const { data } = await supabase.from("booking_pets").select("pet_id").eq("booking_id", bookingId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => row.pet_id);
}

export async function createBooking(
  supabase: SupabaseClient,
  ownerId: string,
  input: CreateBookingInput,
): Promise<Booking> {
  // Verifica esplicita invece di lasciare che l'insert su booking_pets fallisca
  // in modo criptico se un pet_id non è valido o non è del chiamante (la RLS
  // lo bloccherebbe comunque, ma con un errore meno chiaro per l'utente).
  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id")
    .in("id", input.petIds)
    .is("deleted_at", null);
  if (petsError || !pets || pets.length !== input.petIds.length) {
    throw AppError.badRequest("Uno o più animali selezionati non sono validi");
  }

  const { data: service, error: serviceError } = await supabase
    .from("sitter_services")
    .select("price, price_unit")
    .eq("sitter_id", input.sitterId)
    .eq("service_type", input.serviceType)
    .eq("is_active", true)
    .maybeSingle();
  if (serviceError || !service) throw AppError.badRequest("Il sitter non offre (più) questo servizio");

  const { data: sitterProfile } = await supabase
    .from("sitter_profiles")
    .select("status, cancellation_policy")
    .eq("user_id", input.sitterId)
    .maybeSingle();
  if (!sitterProfile || sitterProfile.status !== "approved") {
    throw AppError.badRequest("Il sitter non è al momento disponibile per nuove prenotazioni");
  }

  const quantity = computeQuantity(service.price_unit, input);
  const breakdown = computeBreakdown(Number(service.price), quantity);

  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      owner_id: ownerId,
      sitter_id: input.sitterId,
      service_type: input.serviceType,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
      quantity: breakdown.quantity,
      unit_price: breakdown.unitPrice,
      price_unit: service.price_unit,
      price_total: breakdown.priceTotal,
      platform_fee: breakdown.platformFee,
      sitter_payout: breakdown.sitterPayout,
      cancellation_policy: sitterProfile.cancellation_policy,
      notes: input.notes ?? null,
    })
    .select(BOOKING_COLUMNS)
    .single();

  if (error || !booking) throw AppError.badRequest("Impossibile creare la prenotazione");

  const { error: bookingPetsError } = await supabase
    .from("booking_pets")
    .insert(input.petIds.map((petId) => ({ booking_id: booking.id, pet_id: petId })));
  if (bookingPetsError) throw AppError.badRequest("Prenotazione creata ma impossibile collegare gli animali");

  return mapBookingRow(booking, input.petIds);
}

export async function listMyBookings(supabase: SupabaseClient, status?: string): Promise<Booking[]> {
  let query = supabase.from("bookings").select(BOOKING_COLUMNS).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw AppError.badRequest("Impossibile recuperare le prenotazioni");

  return Promise.all((data ?? []).map(async (row) => mapBookingRow(row, await fetchPetIds(supabase, row.id))));
}

export async function getBookingById(supabase: SupabaseClient, id: string): Promise<Booking> {
  const { data, error } = await supabase.from("bookings").select(BOOKING_COLUMNS).eq("id", id).single();
  if (error || !data) throw AppError.notFound("Prenotazione non trovata");
  return mapBookingRow(data, await fetchPetIds(supabase, id));
}

export async function acceptBooking(supabase: SupabaseClient, id: string, sitterId: string): Promise<Booking> {
  const current = await requireBookingStatus(supabase, id, "pending_request");
  if (current.sitter_id !== sitterId) throw AppError.forbidden("Solo il sitter destinatario può accettare la richiesta");

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", id)
    .select(BOOKING_COLUMNS)
    .single();
  if (error || !data) throw AppError.badRequest("Impossibile accettare la prenotazione");
  return mapBookingRow(data, await fetchPetIds(supabase, id));
}

export async function declineBooking(
  supabase: SupabaseClient,
  id: string,
  sitterId: string,
  input: DeclineBookingInput,
): Promise<Booking> {
  const current = await requireBookingStatus(supabase, id, "pending_request");
  if (current.sitter_id !== sitterId) throw AppError.forbidden("Solo il sitter destinatario può rifiutare la richiesta");

  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "declined", cancellation_reason: input.reason ?? null })
    .eq("id", id)
    .select(BOOKING_COLUMNS)
    .single();
  if (error || !data) throw AppError.badRequest("Impossibile rifiutare la prenotazione");
  return mapBookingRow(data, await fetchPetIds(supabase, id));
}

async function requireBookingStatus(supabase: SupabaseClient, id: string, expected: string) {
  const { data, error } = await supabase.from("bookings").select("status, owner_id, sitter_id").eq("id", id).single();
  if (error || !data) throw AppError.notFound("Prenotazione non trovata");
  if (data.status !== expected) {
    throw AppError.conflict(`La prenotazione è nello stato "${data.status}", non "${expected}"`);
  }
  return data;
}

/**
 * Crea (o recupera, se già creato) il PaymentIntent Stripe per una
 * prenotazione confermata dal sitter — passo separato dall'accettazione:
 * "accept" è una decisione del sitter, "pay" un'azione del proprietario, e
 * tenerli distinti evita che dati di pagamento finiscano nella risposta
 * della chiamata del sitter. Idempotente sul booking id: chiamate ripetute
 * (retry di rete lato client) non creano doppi addebiti.
 */
export async function createPaymentIntent(
  supabase: SupabaseClient,
  id: string,
  ownerId: string,
): Promise<{ clientSecret: string }> {
  const { data: booking, error } = await supabase.from("bookings").select(BOOKING_COLUMNS).eq("id", id).single();
  if (error || !booking) throw AppError.notFound("Prenotazione non trovata");
  if (booking.owner_id !== ownerId) throw AppError.forbidden();
  if (booking.status !== "confirmed") {
    throw AppError.conflict("La prenotazione deve essere confermata dal sitter prima del pagamento");
  }
  if (booking.payment_status === "captured") throw AppError.conflict("Prenotazione già pagata");

  const { data: paymentAccount } = await supabaseAdmin
    .from("sitter_payment_accounts")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("sitter_id", booking.sitter_id)
    .maybeSingle();

  if (!paymentAccount?.stripe_account_id || !paymentAccount.stripe_onboarding_complete) {
    throw AppError.badRequest(
      "Il sitter non ha ancora completato l'attivazione dei pagamenti — riprova più tardi",
      "sitter_stripe_not_ready",
    );
  }

  const stripe = getStripe();

  const paymentIntent = booking.stripe_payment_intent_id
    ? await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id)
    : await stripe.paymentIntents.create(
        {
          amount: Math.round(Number(booking.price_total) * 100),
          currency: booking.currency.toLowerCase(),
          application_fee_amount: Math.round(Number(booking.platform_fee) * 100),
          transfer_data: { destination: paymentAccount.stripe_account_id },
          automatic_payment_methods: { enabled: true },
          metadata: { booking_id: booking.id },
        },
        { idempotencyKey: `booking-payment-intent-${booking.id}` },
      );

  if (!booking.stripe_payment_intent_id) {
    const { error: updateError } = await supabase
      .from("bookings")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", booking.id);
    if (updateError) throw AppError.badRequest("Impossibile registrare il pagamento sulla prenotazione");
  }

  if (!paymentIntent.client_secret) throw AppError.badRequest("Stripe non ha restituito un client secret valido");
  return { clientSecret: paymentIntent.client_secret };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function bookingStartDateTime(booking: { start_date: string; start_time: string | null }): Date {
  return new Date(`${booking.start_date}T${booking.start_time ?? "00:00:00"}`);
}

/**
 * Se cancella il sitter, il proprietario ha sempre diritto al rimborso
 * pieno: la policy di cancellazione esiste per tutelare il sitter dalle
 * disdette tardive dell'owner, non il contrario.
 */
function computeRefundAmount(
  booking: { price_total: string | number; cancellation_policy: CancellationPolicyType; start_date: string; start_time: string | null },
  cancelledByOwner: boolean,
): number {
  const priceTotal = Number(booking.price_total);
  if (!cancelledByOwner) return priceTotal;

  const rule = CANCELLATION_RULES[booking.cancellation_policy];
  const hoursUntilStart = (bookingStartDateTime(booking).getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursUntilStart >= rule.fullRefundHoursBefore) return priceTotal;
  if (rule.partialRefundHoursBefore !== undefined && hoursUntilStart >= rule.partialRefundHoursBefore) {
    return round2(priceTotal * ((rule.partialRefundPercent ?? 0) / 100));
  }
  return 0;
}

export async function cancelBooking(
  supabase: SupabaseClient,
  id: string,
  userId: string,
  input: CancelBookingInput,
): Promise<Booking> {
  const { data: booking, error } = await supabase.from("bookings").select(BOOKING_COLUMNS).eq("id", id).single();
  if (error || !booking) throw AppError.notFound("Prenotazione non trovata");
  if (booking.owner_id !== userId && booking.sitter_id !== userId) throw AppError.forbidden();
  if (booking.status !== "pending_request" && booking.status !== "confirmed") {
    throw AppError.conflict("Questa prenotazione non può più essere cancellata");
  }

  const cancelledByOwner = booking.owner_id === userId;
  let refundAmount = 0;

  if (booking.payment_status === "captured" && booking.stripe_payment_intent_id) {
    refundAmount = computeRefundAmount(booking, cancelledByOwner);
    if (refundAmount > 0) {
      const stripe = getStripe();
      const refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        amount: Math.round(refundAmount * 100),
      });
      const { error: paymentLogError } = await supabaseAdmin.from("payments").insert({
        booking_id: booking.id,
        type: "refund",
        amount: refundAmount,
        currency: booking.currency,
        stripe_object_id: refund.id,
        status: refund.status ?? "pending",
      });
      if (paymentLogError) throw AppError.badRequest("Rimborso Stripe creato ma non registrato — contatta il supporto");
    }
  }

  const { data, error: updateError } = await supabase
    .from("bookings")
    .update({
      status: cancelledByOwner ? "cancelled_by_owner" : "cancelled_by_sitter",
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
      cancellation_reason: input.reason ?? null,
      payment_status: refundAmount > 0 ? "refunded" : booking.payment_status,
    })
    .eq("id", id)
    .select(BOOKING_COLUMNS)
    .single();

  if (updateError || !data) throw AppError.badRequest("Impossibile cancellare la prenotazione");
  return mapBookingRow(data, await fetchPetIds(supabase, id));
}
