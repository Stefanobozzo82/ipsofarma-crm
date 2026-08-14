import type { GpsTrack, ServiceUpdate } from "@fido/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapGpsTrackRow(row: any): GpsTrack {
  return {
    id: row.id,
    bookingId: row.booking_id,
    points: row.points ?? [],
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapServiceUpdateRow(row: any): ServiceUpdate {
  return {
    id: row.id,
    bookingId: row.booking_id,
    type: row.type,
    note: row.note,
    photoUrls: row.photo_urls ?? [],
    createdAt: row.created_at,
  };
}
