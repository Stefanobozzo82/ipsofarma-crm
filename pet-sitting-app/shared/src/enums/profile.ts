/** Ruolo applicativo di base — distingue solo gli admin. Le capacità di
 * proprietario/sitter derivano dalla presenza di una riga in owner_profiles /
 * sitter_profiles: un utente può avere entrambe. */
export const UserRole = {
  User: "user",
  Admin: "admin",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Stato della candidatura sitter — implementa l'accettazione selettiva
 * (stile PetBnb) descritta in docs/PHASE1-PROPOSAL.md. */
export const SitterStatus = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
  Suspended: "suspended",
} as const;

export type SitterStatus = (typeof SitterStatus)[keyof typeof SitterStatus];

export const VerificationStatus = {
  Unverified: "unverified",
  Pending: "pending",
  Verified: "verified",
  Rejected: "rejected",
} as const;

export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const DocumentType = {
  IdCard: "id_card",
  Passport: "passport",
  DriverLicense: "driver_license",
} as const;

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const PetSpecies = {
  Dog: "dog",
  Cat: "cat",
  Other: "other",
} as const;

export type PetSpecies = (typeof PetSpecies)[keyof typeof PetSpecies];

/** I 3 preset di cancellazione tra cui il sitter sceglie — non regole
 * arbitrarie per-sitter, per restare semplici da confrontare in ricerca.
 * Regole di rimborso: shared/src/constants/cancellation.ts */
export const CancellationPolicyType = {
  Flexible: "flexible",
  Moderate: "moderate",
  Strict: "strict",
} as const;

export type CancellationPolicyType = (typeof CancellationPolicyType)[keyof typeof CancellationPolicyType];
