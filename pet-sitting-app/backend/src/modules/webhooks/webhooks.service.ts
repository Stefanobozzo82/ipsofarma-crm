import type Stripe from "stripe";
import { AppError } from "../../lib/app-error";
import { logger } from "../../lib/logger";
import { getStripe, requireStripeWebhookSecret } from "../../lib/stripe";
import { supabaseAdmin } from "../../lib/supabase";
import { notifyUser } from "../notifications/notification.service";

/**
 * Unico endpoint per eventi Stripe "piattaforma" e "account connesso" — nel
 * Dashboard Stripe va configurato un solo webhook con entrambe le opzioni
 * ("Events on your account" + "Events on Connected accounts") attive,
 * condividono lo stesso signing secret.
 */
export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
  if (!signature) throw AppError.badRequest("Firma webhook mancante");
  const webhookSecret = requireStripeWebhookSecret();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw AppError.badRequest(`Firma webhook non valida: ${(err as Error).message}`);
  }

  switch (event.type) {
    case "payment_intent.succeeded":
      await onPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    case "payment_intent.payment_failed":
      await onPaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    case "account.updated":
      await onAccountUpdated(event.data.object as Stripe.Account);
      break;
    case "payout.paid":
    case "payout.failed":
      await onPayoutUpdated(event.data.object as Stripe.Payout, event.type === "payout.paid" ? "paid" : "failed");
      break;
    default:
      logger.info(`Evento Stripe non gestito: ${event.type}`);
  }
}

async function onPaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = paymentIntent.metadata.booking_id;
  if (!bookingId) return;

  const { error: paymentError } = await supabaseAdmin.from("payments").insert({
    booking_id: bookingId,
    type: "charge",
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency.toUpperCase(),
    stripe_object_id: paymentIntent.id,
    status: "succeeded",
  });
  if (paymentError) logger.error("Impossibile registrare il pagamento", paymentError);

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .update({ payment_status: "captured" })
    .eq("id", bookingId)
    .select("sitter_id")
    .maybeSingle();
  if (bookingError) logger.error("Impossibile aggiornare payment_status della prenotazione", bookingError);

  if (booking) {
    await notifyUser(booking.sitter_id, "booking_paid", "Pagamento ricevuto", "Il proprietario ha completato il pagamento.", {
      bookingId,
    });
  }
}

async function onPaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  const bookingId = paymentIntent.metadata.booking_id;
  if (!bookingId) return;

  const { error } = await supabaseAdmin.from("bookings").update({ payment_status: "failed" }).eq("id", bookingId);
  if (error) logger.error("Impossibile aggiornare payment_status (failed)", error);
}

async function onAccountUpdated(account: Stripe.Account) {
  const onboardingComplete = Boolean(account.charges_enabled && account.payouts_enabled);
  const { error } = await supabaseAdmin
    .from("sitter_payment_accounts")
    .update({ stripe_onboarding_complete: onboardingComplete })
    .eq("stripe_account_id", account.id);
  if (error) logger.error("Impossibile aggiornare lo stato onboarding Stripe", error);
}

async function onPayoutUpdated(payout: Stripe.Payout, status: "paid" | "failed") {
  const { data, error } = await supabaseAdmin
    .from("payouts")
    .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
    .eq("stripe_payout_id", payout.id)
    .select("sitter_id, amount")
    .maybeSingle();
  if (error) logger.error("Impossibile aggiornare lo stato del payout", error);

  if (data) {
    await notifyUser(
      data.sitter_id,
      `payout_${status}`,
      status === "paid" ? "Payout accreditato" : "Payout non riuscito",
      status === "paid" ? `${Number(data.amount).toFixed(2)}€ accreditati sul tuo conto.` : "Controlla i dati del tuo conto Stripe.",
    );
  }
}
