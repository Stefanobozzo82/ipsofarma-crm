import type { Dispute } from "@fido/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapDisputeRow(row: any): Dispute {
  return {
    id: row.id,
    bookingId: row.booking_id,
    openedBy: row.opened_by,
    reason: row.reason,
    description: row.description,
    status: row.status,
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}
