import type { CreateReviewInput, Review } from "@fido/shared";
import { apiFetch } from "@/lib/api";

export function createReview(bookingId: string, input: CreateReviewInput): Promise<Review> {
  return apiFetch<Review>(`/bookings/${bookingId}/reviews`, { method: "POST", body: input });
}

export function listSitterReviews(sitterId: string): Promise<Review[]> {
  return apiFetch<Review[]>(`/sitters/${sitterId}/reviews`, { auth: false });
}
