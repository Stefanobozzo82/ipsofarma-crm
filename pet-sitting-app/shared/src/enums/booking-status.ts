/** Macchina a stati di una prenotazione. Introdotta in Fase 4 (booking), definita
 * qui fin da ora perché referenziata dai tipi condivisi. */
export const BookingStatus = {
  PendingRequest: "pending_request",
  Confirmed: "confirmed",
  InProgress: "in_progress",
  Completed: "completed",
  CancelledByOwner: "cancelled_by_owner",
  CancelledBySitter: "cancelled_by_sitter",
  Declined: "declined",
  Disputed: "disputed",
} as const;

export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const PaymentStatus = {
  Pending: "pending",
  Authorized: "authorized",
  Captured: "captured",
  Refunded: "refunded",
  Failed: "failed",
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const ReviewDirection = {
  OwnerToSitter: "owner_to_sitter",
  SitterToOwner: "sitter_to_owner",
} as const;

export type ReviewDirection = (typeof ReviewDirection)[keyof typeof ReviewDirection];

export const MeetGreetStatus = {
  Requested: "requested",
  Proposed: "proposed",
  Accepted: "accepted",
  Declined: "declined",
  Cancelled: "cancelled",
} as const;

export type MeetGreetStatus = (typeof MeetGreetStatus)[keyof typeof MeetGreetStatus];
