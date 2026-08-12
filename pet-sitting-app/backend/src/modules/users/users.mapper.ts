import type { OwnerProfile, SitterProfile, User } from "@fido/shared";

/** Le tabelle Postgres usano snake_case, i tipi condivisi usano camelCase —
 * questi mapper sono il confine esplicito tra i due mondi. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapUserRow(row: any): User {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    firstName: row.first_name,
    lastName: row.last_name,
    avatarUrl: row.avatar_url,
    city: row.city,
    region: row.region,
    role: row.role,
    gdprConsentAt: row.gdpr_consent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapOwnerProfileRow(row: any): OwnerProfile {
  return {
    userId: row.user_id,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    stripeCustomerId: row.stripe_customer_id,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSitterProfileRow(row: any): SitterProfile {
  return {
    userId: row.user_id,
    bio: row.bio,
    experienceYears: row.experience_years,
    status: row.status,
    verificationStatus: row.verification_status,
    serviceRadiusKm: row.service_radius_km,
    baseLatitude: row.base_latitude,
    baseLongitude: row.base_longitude,
    address: row.address,
    stripeAccountId: row.stripe_account_id,
    stripeOnboardingComplete: row.stripe_onboarding_complete,
    averageRating: row.average_rating === null ? null : Number(row.average_rating),
    reviewCount: row.review_count,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
