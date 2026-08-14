import type { Payout, RequestPayoutInput } from "@fido/shared";
import { apiFetch } from "@/lib/api";

export interface PayoutSummary {
  onboardingComplete: boolean;
  availableBalance: number | null;
  pendingBalance: number | null;
  history: Payout[];
}

export function getPayoutSummary(): Promise<PayoutSummary> {
  return apiFetch<PayoutSummary>("/sitters/me/payouts");
}

export function requestPayout(input: RequestPayoutInput): Promise<Payout> {
  return apiFetch<Payout>("/sitters/me/payouts/request", { method: "POST", body: input });
}

export function createStripeOnboardingLink(): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/sitters/me/stripe/onboarding-link", { method: "POST" });
}
