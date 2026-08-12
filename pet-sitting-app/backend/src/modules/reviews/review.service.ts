import { ReviewDirection, type CreateReviewInput, type Review } from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { supabaseAnon } from "../../lib/supabase";
import { mapReviewRow } from "./review.mapper";

const REVIEW_COLUMNS =
  "id, booking_id, reviewer_id, reviewee_id, direction, rating, comment, reviewer_first_name, response, response_at, created_at";

export async function createReview(
  supabase: SupabaseClient,
  bookingId: string,
  reviewerId: string,
  input: CreateReviewInput,
): Promise<Review> {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("owner_id, sitter_id, status")
    .eq("id", bookingId)
    .single();
  if (bookingError || !booking) throw AppError.notFound("Prenotazione non trovata");
  if (booking.status !== "completed") throw AppError.badRequest("Puoi recensire solo un servizio completato");

  let direction: ReviewDirection;
  let revieweeId: string;
  if (booking.owner_id === reviewerId) {
    direction = ReviewDirection.OwnerToSitter;
    revieweeId = booking.sitter_id;
  } else if (booking.sitter_id === reviewerId) {
    direction = ReviewDirection.SitterToOwner;
    revieweeId = booking.owner_id;
  } else {
    throw AppError.forbidden("Non hai partecipato a questa prenotazione");
  }

  // Snapshot del nome — letto con lo stesso client scoped del chiamante,
  // che può sempre leggere la propria riga (policy "users_select_self").
  const { data: reviewer, error: reviewerError } = await supabase
    .from("users")
    .select("first_name")
    .eq("id", reviewerId)
    .single();
  if (reviewerError || !reviewer) throw AppError.badRequest("Impossibile identificare l'autore della recensione");

  const { data, error: insertError } = await supabase
    .from("reviews")
    .insert({
      booking_id: bookingId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      direction,
      rating: input.rating,
      comment: input.comment ?? null,
      reviewer_first_name: reviewer.first_name,
    })
    .select(REVIEW_COLUMNS)
    .single();

  if (insertError) {
    if (insertError.code === "23505") throw AppError.conflict("Hai già recensito questa prenotazione");
    throw AppError.badRequest("Impossibile pubblicare la recensione");
  }
  if (!data) throw AppError.badRequest("Impossibile pubblicare la recensione");
  return mapReviewRow(data);
}

/** Recensioni pubbliche di un sitter (direction owner_to_sitter) — nessuna
 * auth richiesta, usa il client anon come il resto del profilo pubblico. */
export async function listSitterReviews(sitterId: string): Promise<Review[]> {
  const { data, error } = await supabaseAnon
    .from("reviews")
    .select(REVIEW_COLUMNS)
    .eq("reviewee_id", sitterId)
    .eq("direction", ReviewDirection.OwnerToSitter)
    .order("created_at", { ascending: false });

  if (error) throw AppError.badRequest("Impossibile recuperare le recensioni");
  return (data ?? []).map(mapReviewRow);
}
