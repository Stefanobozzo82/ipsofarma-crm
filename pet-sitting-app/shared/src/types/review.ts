import type { ReviewDirection } from "../enums";

export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  direction: ReviewDirection;
  rating: number;
  comment: string | null;
  /** Snapshot del nome al momento della recensione — vedi la migrazione
   * 20260812150000_reviews.sql sul perché non è un join a users. */
  reviewerFirstName: string;
  response: string | null;
  responseAt: string | null;
  createdAt: string;
}
