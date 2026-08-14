import type { AvailabilityException, SitterAvailabilitySlot, SitterSearchResult, SitterService } from "@fido/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSitterServiceRow(row: any): SitterService {
  return {
    id: row.id,
    sitterId: row.sitter_id,
    serviceType: row.service_type,
    price: Number(row.price),
    priceUnit: row.price_unit,
    durationMinutes: row.duration_minutes,
    maxPets: row.max_pets,
    isActive: row.is_active,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAvailabilitySlotRow(row: any): SitterAvailabilitySlot {
  return {
    dayOfWeek: row.day_of_week,
    startTime: row.start_time?.slice(0, 5) ?? row.start_time,
    endTime: row.end_time?.slice(0, 5) ?? row.end_time,
    serviceType: row.service_type,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAvailabilityExceptionRow(row: any): AvailabilityException {
  return {
    date: row.date,
    isAvailable: row.is_available,
    note: row.note,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSearchResultRow(row: any): SitterSearchResult {
  return {
    sitterId: row.sitter_id,
    firstName: row.first_name,
    avatarUrl: row.avatar_url,
    city: row.city,
    bio: row.bio,
    averageRating: row.average_rating === null ? null : Number(row.average_rating),
    reviewCount: row.review_count,
    distanceKm: Number(row.distance_km),
    price: Number(row.price),
    priceUnit: row.price_unit,
  };
}
