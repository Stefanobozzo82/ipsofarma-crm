import type {
  AvailabilityException,
  PublicSitterProfile,
  SetSitterAvailabilityInput,
  SetSitterServicesInput,
  SitterApplyInput,
  SitterAvailabilitySlot,
  SitterProfile,
  SitterService,
  UpdateSitterProfileInput,
} from "@fido/shared";
import { apiFetch } from "@/lib/api";

export function getPublicSitterProfile(sitterId: string): Promise<PublicSitterProfile> {
  return apiFetch<PublicSitterProfile>(`/sitters/${sitterId}/public`, { auth: false });
}

export function applyAsSitter(input: SitterApplyInput): Promise<SitterProfile> {
  return apiFetch<SitterProfile>("/sitters/apply", { method: "POST", body: input });
}

export function getMySitterProfile(): Promise<SitterProfile> {
  return apiFetch<SitterProfile>("/sitters/me");
}

export function updateMySitterProfile(input: UpdateSitterProfileInput): Promise<SitterProfile> {
  return apiFetch<SitterProfile>("/sitters/me", { method: "PATCH", body: input });
}

export function listMyServices(): Promise<SitterService[]> {
  return apiFetch<SitterService[]>("/sitters/me/services");
}

export function setMyServices(input: SetSitterServicesInput): Promise<SitterService[]> {
  return apiFetch<SitterService[]>("/sitters/me/services", { method: "PUT", body: input });
}

export interface AvailabilityData {
  slots: SitterAvailabilitySlot[];
  exceptions: AvailabilityException[];
}

export function listMyAvailability(): Promise<AvailabilityData> {
  return apiFetch<AvailabilityData>("/sitters/me/availability");
}

export function setMyAvailability(input: SetSitterAvailabilityInput): Promise<AvailabilityData> {
  return apiFetch<AvailabilityData>("/sitters/me/availability", { method: "PUT", body: input });
}
