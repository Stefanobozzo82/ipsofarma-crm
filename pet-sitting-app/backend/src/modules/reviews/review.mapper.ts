import type { Review } from "@fido/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapReviewRow(row: any): Review {
  return {
    id: row.id,
    bookingId: row.booking_id,
    reviewerId: row.reviewer_id,
    revieweeId: row.reviewee_id,
    direction: row.direction,
    rating: row.rating,
    comment: row.comment,
    reviewerFirstName: row.reviewer_first_name,
    response: row.response,
    responseAt: row.response_at,
    createdAt: row.created_at,
  };
}
