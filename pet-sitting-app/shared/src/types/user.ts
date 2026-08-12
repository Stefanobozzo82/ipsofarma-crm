import type { SitterStatus, UserRole, VerificationStatus } from "../enums";
import type { SitterService } from "./sitter-service";

/** Riga public.users — estende auth.users di Supabase con i campi applicativi. */
export interface User {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  city: string | null;
  region: string | null;
  role: UserRole;
  gdprConsentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Estensione proprietario — presente solo se l'utente ha completato l'onboarding owner. */
export interface OwnerProfile {
  userId: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  stripeCustomerId: string | null;
  createdAt: string;
}

/** Estensione sitter — presente solo se l'utente ha fatto domanda come sitter. */
export interface SitterProfile {
  userId: string;
  bio: string | null;
  experienceYears: number | null;
  status: SitterStatus;
  verificationStatus: VerificationStatus;
  serviceRadiusKm: number | null;
  baseLatitude: number | null;
  baseLongitude: number | null;
  address: string | null;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  averageRating: number | null;
  reviewCount: number;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Profilo utente "composito" così come restituito da GET /users/me:
 * l'identità di base più gli eventuali profili owner/sitter collegati. */
export interface UserWithProfiles extends User {
  ownerProfile: OwnerProfile | null;
  sitterProfile: SitterProfile | null;
}

/** Sottoinsieme pubblico del profilo sitter, per GET /sitters/:id/public —
 * nessun dato sensibile (Stripe, verifica, indirizzo esatto). */
export interface PublicSitterProfile {
  userId: string;
  firstName: string;
  avatarUrl: string | null;
  city: string | null;
  bio: string | null;
  experienceYears: number | null;
  averageRating: number | null;
  reviewCount: number;
  services: SitterService[];
}
