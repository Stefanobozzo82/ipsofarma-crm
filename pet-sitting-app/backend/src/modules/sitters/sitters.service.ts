import type {
  PublicSitterProfile,
  RequestDocumentUploadInput,
  SitterApplyInput,
  SitterProfile,
  UpdateSitterProfileInput,
  VerificationDocument,
} from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { supabaseAnon } from "../../lib/supabase";
import { mapSitterProfileRow } from "../users/users.mapper";

const SITTER_COLUMNS =
  "user_id, bio, experience_years, status, verification_status, service_radius_km, base_latitude, base_longitude, address, stripe_account_id, stripe_onboarding_complete, average_rating, review_count, approved_at, approved_by, created_at, updated_at";

export async function applyAsSitter(
  supabase: SupabaseClient,
  userId: string,
  input: SitterApplyInput,
): Promise<SitterProfile> {
  const { data: existing } = await supabase.from("sitter_profiles").select("user_id").eq("user_id", userId).maybeSingle();

  if (existing) {
    throw AppError.conflict("Hai già una candidatura come sitter — usa PATCH /sitters/me per modificarla");
  }

  const { data, error } = await supabase
    .from("sitter_profiles")
    .insert({
      user_id: userId,
      bio: input.bio,
      experience_years: input.experienceYears,
      address: input.address,
      base_latitude: input.latitude,
      base_longitude: input.longitude,
      service_radius_km: input.serviceRadiusKm,
    })
    .select(SITTER_COLUMNS)
    .single();

  if (error || !data) throw AppError.badRequest("Impossibile inviare la candidatura sitter");
  return mapSitterProfileRow(data);
}

export async function getMySitterProfile(supabase: SupabaseClient, userId: string): Promise<SitterProfile> {
  const { data, error } = await supabase.from("sitter_profiles").select(SITTER_COLUMNS).eq("user_id", userId).single();
  if (error || !data) throw AppError.notFound("Nessuna candidatura sitter trovata — usa POST /sitters/apply");
  return mapSitterProfileRow(data);
}

export async function updateMySitterProfile(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateSitterProfileInput,
): Promise<SitterProfile> {
  const patch: Record<string, unknown> = {};
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.experienceYears !== undefined) patch.experience_years = input.experienceYears;
  if (input.address !== undefined) patch.address = input.address;
  if (input.latitude !== undefined) patch.base_latitude = input.latitude;
  if (input.longitude !== undefined) patch.base_longitude = input.longitude;
  if (input.serviceRadiusKm !== undefined) patch.service_radius_km = input.serviceRadiusKm;

  const { data, error } = await supabase
    .from("sitter_profiles")
    .update(patch)
    .eq("user_id", userId)
    .select(SITTER_COLUMNS)
    .single();

  if (error || !data) throw AppError.badRequest("Impossibile aggiornare il profilo sitter");
  return mapSitterProfileRow(data);
}

/** Profilo pubblico di un sitter approvato — nessuna auth richiesta.
 * Le policy RLS "…_public_read_approved" filtrano già ai soli sitter con
 * status = 'approved', quindi qui non serve un controllo aggiuntivo. */
export async function getPublicSitterProfile(sitterId: string): Promise<PublicSitterProfile> {
  const { data, error } = await supabaseAnon
    .from("users")
    .select("id, first_name, avatar_url, city, sitter_profiles(bio, experience_years, average_rating, review_count)")
    .eq("id", sitterId)
    .single();

  if (error || !data) throw AppError.notFound("Sitter non trovato o non ancora approvato");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sitterProfile = Array.isArray((data as any).sitter_profiles)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any).sitter_profiles[0]
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any).sitter_profiles;

  if (!sitterProfile) throw AppError.notFound("Sitter non trovato o non ancora approvato");

  return {
    userId: data.id,
    firstName: data.first_name,
    avatarUrl: data.avatar_url,
    city: data.city,
    bio: sitterProfile.bio,
    experienceYears: sitterProfile.experience_years,
    averageRating: sitterProfile.average_rating === null ? null : Number(sitterProfile.average_rating),
    reviewCount: sitterProfile.review_count,
  };
}

/**
 * Genera un URL di upload firmato per un documento di verifica identità e
 * registra la riga verification_documents in stato "pending". Il file
 * viene caricato dal client direttamente su Supabase Storage con l'URL
 * restituito — i byte non passano da Express.
 */
export async function requestDocumentUpload(
  supabase: SupabaseClient,
  userId: string,
  input: RequestDocumentUploadInput,
): Promise<{ uploadUrl: string; token: string; path: string; document: VerificationDocument }> {
  const path = `${userId}/${input.documentType}-${Date.now()}.${input.fileExt}`;

  const { data: signed, error: signError } = await supabase.storage
    .from("verification-documents")
    .createSignedUploadUrl(path);

  if (signError || !signed) throw AppError.badRequest("Impossibile generare l'URL di upload");

  const { data: docRow, error: docError } = await supabase
    .from("verification_documents")
    .insert({ sitter_id: userId, document_type: input.documentType, file_path: path })
    .select("id, sitter_id, document_type, file_path, status, reviewed_by, reviewed_at, created_at")
    .single();

  if (docError || !docRow) throw AppError.badRequest("Impossibile registrare il documento");

  return {
    uploadUrl: signed.signedUrl,
    token: signed.token,
    path,
    document: {
      id: docRow.id,
      sitterId: docRow.sitter_id,
      documentType: docRow.document_type,
      filePath: docRow.file_path,
      status: docRow.status,
      reviewedBy: docRow.reviewed_by,
      reviewedAt: docRow.reviewed_at,
      createdAt: docRow.created_at,
    },
  };
}
