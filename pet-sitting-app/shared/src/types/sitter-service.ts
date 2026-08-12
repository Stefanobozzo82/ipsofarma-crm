import type { PriceUnit, ServiceType } from "../enums";

export interface SitterService {
  id: string;
  sitterId: string;
  serviceType: ServiceType;
  price: number;
  priceUnit: PriceUnit;
  durationMinutes: number | null;
  maxPets: number;
  isActive: boolean;
}

/** day_of_week segue la convenzione Postgres EXTRACT(dow): 0 = domenica … 6 = sabato. */
export interface SitterAvailabilitySlot {
  dayOfWeek: number;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  serviceType: ServiceType | null; // null = vale per tutti i servizi
}

export interface AvailabilityException {
  date: string; // "YYYY-MM-DD"
  isAvailable: boolean;
  note: string | null;
}

/** Riga restituita da GET /search/sitters (funzione nearby_sitters). */
export interface SitterSearchResult {
  sitterId: string;
  firstName: string;
  avatarUrl: string | null;
  city: string | null;
  bio: string | null;
  averageRating: number | null;
  reviewCount: number;
  distanceKm: number;
  price: number;
  priceUnit: PriceUnit;
}
