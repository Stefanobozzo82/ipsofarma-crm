import type {
  PublicSitterProfile,
  SitterApplyInput,
  SitterProfile,
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
