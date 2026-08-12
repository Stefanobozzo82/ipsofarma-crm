import type { Booking } from "@fido/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapBookingRow(row: any, petIds: string[] = []): Booking {
  return {
    id: row.id,
    ownerId: row.owner_id,
    sitterId: row.sitter_id,
    serviceType: row.service_type,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time?.slice(0, 5) ?? row.start_time,
    endTime: row.end_time?.slice(0, 5) ?? row.end_time,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    priceUnit: row.price_unit,
    priceTotal: Number(row.price_total),
    platformFee: Number(row.platform_fee),
    sitterPayout: Number(row.sitter_payout),
    currency: row.currency,
    paymentStatus: row.payment_status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    cancellationPolicy: row.cancellation_policy,
    notes: row.notes,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason,
    petIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
