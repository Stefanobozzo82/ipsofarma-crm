import type { Payout, RequestPayoutInput } from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../config/env";
import { AppError } from "../../lib/app-error";
import { supabaseAdmin } from "../../lib/supabase";
import { getStripe } from "../../lib/stripe";

/**
 * Le scritture su sitter_payment_accounts passano sempre da supabaseAdmin
 * (nessuna policy insert/update per il client scoped all'utente, vedi la
 * migrazione 20260812135000): questo modulo tocca dati finanziari sensibili
 * e l'unico punto di scrittura autorizzato è il backend stesso.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPayoutRow(row: any): Payout {
  return {
    id: row.id,
    sitterId: row.sitter_id,
    amount: Number(row.amount),
    currency: row.currency,
    stripePayoutId: row.stripe_payout_id,
    status: row.status,
    requestedAt: row.requested_at,
    paidAt: row.paid_at,
  };
}

async function getOrCreateConnectAccountId(userId: string, email: string | undefined): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("sitter_payment_accounts")
    .select("stripe_account_id")
    .eq("sitter_id", userId)
    .maybeSingle();

  if (existing?.stripe_account_id) return existing.stripe_account_id;

  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    country: "IT",
    email,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  const { error } = await supabaseAdmin
    .from("sitter_payment_accounts")
    .upsert({ sitter_id: userId, stripe_account_id: account.id });
  if (error) throw AppError.badRequest("Impossibile salvare l'account Stripe");

  return account.id;
}

export async function createOnboardingLink(userId: string, email: string | undefined): Promise<{ url: string }> {
  const stripe = getStripe();
  const accountId = await getOrCreateConnectAccountId(userId, email);

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: env.STRIPE_CONNECT_REFRESH_URL,
    return_url: env.STRIPE_CONNECT_RETURN_URL,
  });

  return { url: link.url };
}

export async function getPayoutSummary(supabase: SupabaseClient, userId: string) {
  const { data: account } = await supabaseAdmin
    .from("sitter_payment_accounts")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("sitter_id", userId)
    .maybeSingle();

  const { data: history, error } = await supabase
    .from("payouts")
    .select("id, sitter_id, amount, currency, stripe_payout_id, status, requested_at, paid_at")
    .eq("sitter_id", userId)
    .order("requested_at", { ascending: false });

  if (error) throw AppError.badRequest("Impossibile recuperare lo storico payout");

  let availableBalance: number | null = null;
  let pendingBalance: number | null = null;
  if (account?.stripe_account_id && account.stripe_onboarding_complete) {
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve({ stripeAccount: account.stripe_account_id });
    const eurAvailable = balance.available.find((b) => b.currency === "eur");
    const eurPending = balance.pending.find((b) => b.currency === "eur");
    availableBalance = (eurAvailable?.amount ?? 0) / 100;
    pendingBalance = (eurPending?.amount ?? 0) / 100;
  }

  return {
    onboardingComplete: account?.stripe_onboarding_complete ?? false,
    availableBalance,
    pendingBalance,
    history: (history ?? []).map(mapPayoutRow),
  };
}

export async function requestPayout(userId: string, input: RequestPayoutInput): Promise<Payout> {
  const { data: account } = await supabaseAdmin
    .from("sitter_payment_accounts")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("sitter_id", userId)
    .maybeSingle();

  if (!account?.stripe_account_id || !account.stripe_onboarding_complete) {
    throw AppError.badRequest("Completa l'onboarding Stripe prima di richiedere un payout", "stripe_onboarding_incomplete");
  }

  const stripe = getStripe();
  const balance = await stripe.balance.retrieve({ stripeAccount: account.stripe_account_id });
  const availableCents = balance.available.find((b) => b.currency === "eur")?.amount ?? 0;

  const requestedCents = input.amount ? Math.round(input.amount * 100) : availableCents;
  if (requestedCents <= 0) throw AppError.badRequest("Nessun saldo disponibile per il payout");
  if (requestedCents > availableCents) throw AppError.badRequest("Importo richiesto superiore al saldo disponibile");

  const payout = await stripe.payouts.create(
    { amount: requestedCents, currency: "eur" },
    { stripeAccount: account.stripe_account_id },
  );

  const { data, error } = await supabaseAdmin
    .from("payouts")
    .insert({
      sitter_id: userId,
      amount: requestedCents / 100,
      currency: "EUR",
      stripe_payout_id: payout.id,
      status: "pending",
    })
    .select("id, sitter_id, amount, currency, stripe_payout_id, status, requested_at, paid_at")
    .single();

  if (error || !data) throw AppError.badRequest("Payout creato su Stripe ma non registrato — contatta il supporto");
  return mapPayoutRow(data);
}
