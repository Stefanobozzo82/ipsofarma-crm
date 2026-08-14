import Stripe from "stripe";
import { env } from "../config/env";
import { AppError } from "./app-error";

let client: Stripe | null = null;

/**
 * Client Stripe istanziato pigramente: senza STRIPE_SECRET_KEY il resto
 * dell'API (auth, profili, ricerca) funziona comunque — solo le rotte che
 * chiamano getStripe() falliscono con un 503 esplicito, invece di impedire
 * l'avvio del server o rompere silenziosamente altre funzionalità.
 */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, "stripe_not_configured", "Stripe non configurato — imposta STRIPE_SECRET_KEY in .env");
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return client;
}

export function requireStripeWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, "stripe_not_configured", "Webhook Stripe non configurato — imposta STRIPE_WEBHOOK_SECRET in .env");
  }
  return env.STRIPE_WEBHOOK_SECRET;
}
