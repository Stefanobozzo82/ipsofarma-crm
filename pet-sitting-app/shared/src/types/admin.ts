import type { DisputeStatus } from "../enums";

export interface Dispute {
  id: string;
  bookingId: string;
  openedBy: string;
  reason: string;
  description: string | null;
  status: DisputeStatus;
  resolution: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Riga della coda di approvazione — solo i campi che servono all'admin
 * per decidere, non l'intero SitterProfile. */
export interface PendingSitterApplication {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  bio: string | null;
  experienceYears: number | null;
  address: string | null;
  serviceRadiusKm: number | null;
  createdAt: string;
}

export interface AdminReview {
  id: string;
  bookingId: string;
  reviewerFirstName: string;
  revieweeId: string;
  direction: string;
  rating: number;
  comment: string | null;
  isHidden: boolean;
  createdAt: string;
}

export interface AdminStats {
  totalUsers: number;
  totalOwners: number;
  totalSitters: number;
  pendingSitterApplications: number;
  totalBookings: number;
  completedBookings: number;
  grossMerchandiseValue: number;
  openDisputes: number;
}
