import type { UpdateUserInput, UserWithProfiles } from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { mapOwnerProfileRow, mapSitterProfileRow, mapUserRow } from "./users.mapper";

/** Snake_case: le colonne DB da aggiornare via PATCH /users/me. */
const USER_COLUMNS = "id, email, phone, first_name, last_name, avatar_url, city, region, role, gdpr_consent_at, created_at, updated_at";

export async function getMe(supabase: SupabaseClient, userId: string): Promise<UserWithProfiles> {
  const [userRes, ownerRes, sitterRes] = await Promise.all([
    supabase.from("users").select(USER_COLUMNS).eq("id", userId).single(),
    supabase.from("owner_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("sitter_profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  if (userRes.error || !userRes.data) throw AppError.notFound("Profilo utente non trovato");

  return {
    ...mapUserRow(userRes.data),
    ownerProfile: ownerRes.data ? mapOwnerProfileRow(ownerRes.data) : null,
    sitterProfile: sitterRes.data ? mapSitterProfileRow(sitterRes.data) : null,
  };
}

export async function updateMe(supabase: SupabaseClient, userId: string, input: UpdateUserInput) {
  const patch: Record<string, unknown> = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.city !== undefined) patch.city = input.city;
  if (input.region !== undefined) patch.region = input.region;
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;

  const { data, error } = await supabase.from("users").update(patch).eq("id", userId).select(USER_COLUMNS).single();

  if (error || !data) throw AppError.badRequest("Impossibile aggiornare il profilo");
  return mapUserRow(data);
}
