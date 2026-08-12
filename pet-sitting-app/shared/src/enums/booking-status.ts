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
