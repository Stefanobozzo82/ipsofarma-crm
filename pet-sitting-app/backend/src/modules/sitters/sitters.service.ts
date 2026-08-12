import type {
  PublicSitterProfile,
  RequestDocumentUploadInput,
  SetSitterAvailabilityInput,
  SetSitterServicesInput,
  SitterApplyInput,
  SitterAvailabilitySlot,
  SitterProfile,
  SitterService,
  UpdateSitterProfileInput,
  VerificationDocument,
} from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { supabaseAnon } from "../../lib/supabase";
import { mapSitterProfileRow } from "../users/users.mapper";
import {
  mapAvailabilityExceptionRow,
  mapAvailabilitySlotRow,
  mapSitterServiceRow,
} from "./sitters.mapper";

const SITTER_COLUMNS =
  "user_id, bio, experience_years, status, verification_status, service_radius_km, base_latitude, base_longitude, address, accepted_species, cancellation_policy, average_rating, review_count, approved_at, approved_by, created_at, updated_at";

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
  if (input.acceptedSpecies !== undefined) patch.accepted_species = input.acceptedSpecies;
  if (input.cancellationPolicy !== undefined) patch.cancellation_policy = input.cancellationPolicy;

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
  const [{ data, error }, { data: serviceRows }] = await Promise.all([
    supabaseAnon
      .from("users")
      .select(
        "id, first_name, avatar_url, city, sitter_profiles(bio, experience_years, average_rating, review_count, cancellation_policy)",
      )
      .eq("id", sitterId)
      .single(),
    supabaseAnon
      .from("sitter_services")
      .select("id, sitter_id, service_type, price, price_unit, duration_minutes, max_pets, is_active")
      .eq("sitter_id", sitterId)
      .eq("is_active", true),
  ]);

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
    cancellationPolicy: sitterProfile.cancellation_policy,
    services: (serviceRows ?? []).map(mapSitterServiceRow),
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

const SERVICE_COLUMNS = "id, sitter_id, service_type, price, price_unit, duration_minutes, max_pets, is_active";

export async function listMyServices(supabase: SupabaseClient, userId: string): Promise<SitterService[]> {
  const { data, error } = await supabase.from("sitter_services").select(SERVICE_COLUMNS).eq("sitter_id", userId);
  if (error) throw AppError.badRequest("Impossibile recuperare i servizi");
  return (data ?? []).map(mapSitterServiceRow);
}

/**
 * Sostituisce l'intero listino del sitter (semantica PUT). Cancellazione +
 * inserimento sequenziali con il client scoped all'utente: per l'MVP è
 * accettabile una finestra non atomica di pochi millisecondi; se in futuro
 * servisse una vera transazione conviene spostare la logica in una funzione
 * Postgres richiamata via RPC.
 */
export async function setMyServices(
  supabase: SupabaseClient,
  userId: string,
  input: SetSitterServicesInput,
): Promise<SitterService[]> {
  const { error: deleteError } = await supabase.from("sitter_services").delete().eq("sitter_id", userId);
  if (deleteError) throw AppError.badRequest("Impossibile aggiornare il listino servizi");

  if (input.length === 0) return [];

  const rows = input.map((service) => ({
    sitter_id: userId,
    service_type: service.serviceType,
    price: service.price,
    price_unit: service.priceUnit,
    duration_minutes: service.durationMinutes ?? null,
    max_pets: service.maxPets,
    is_active: service.isActive,
  }));

  const { data, error } = await supabase.from("sitter_services").insert(rows).select(SERVICE_COLUMNS);
  if (error || !data) throw AppError.badRequest("Impossibile salvare il listino servizi");
  return data.map(mapSitterServiceRow);
}

export async function listMyAvailability(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ slots: SitterAvailabilitySlot[]; exceptions: ReturnType<typeof mapAvailabilityExceptionRow>[] }> {
  const [slotsRes, exceptionsRes] = await Promise.all([
    supabase
      .from("sitter_availability")
      .select("day_of_week, start_time, end_time, service_type")
      .eq("sitter_id", userId)
      .order("day_of_week", { ascending: true }),
    supabase
      .from("availability_exceptions")
      .select("date, is_available, note")
      .eq("sitter_id", userId)
      .order("date", { ascending: true }),
  ]);

  if (slotsRes.error || exceptionsRes.error) throw AppError.badRequest("Impossibile recuperare la disponibilità");

  return {
    slots: (slotsRes.data ?? []).map(mapAvailabilitySlotRow),
    exceptions: (exceptionsRes.data ?? []).map(mapAvailabilityExceptionRow),
  };
}

/** Sostituisce interamente il pattern settimanale e le eccezioni (semantica PUT). */
export async function setMyAvailability(supabase: SupabaseClient, userId: string, input: SetSitterAvailabilityInput) {
  const [deleteSlots, deleteExceptions] = await Promise.all([
    supabase.from("sitter_availability").delete().eq("sitter_id", userId),
    supabase.from("availability_exceptions").delete().eq("sitter_id", userId),
  ]);
  if (deleteSlots.error || deleteExceptions.error) throw AppError.badRequest("Impossibile aggiornare la disponibilità");

  const slotRows = input.slots.map((slot) => ({
    sitter_id: userId,
    day_of_week: slot.dayOfWeek,
    start_time: slot.startTime,
    end_time: slot.endTime,
    service_type: slot.serviceType,
  }));
  const exceptionRows = input.exceptions.map((exception) => ({
    sitter_id: userId,
    date: exception.date,
    is_available: exception.isAvailable,
    note: exception.note ?? null,
  }));

  const [slotsInsert, exceptionsInsert] = await Promise.all([
    slotRows.length > 0
      ? supabase.from("sitter_availability").insert(slotRows).select("day_of_week, start_time, end_time, service_type")
      : Promise.resolve({ data: [], error: null }),
    exceptionRows.length > 0
      ? supabase.from("availability_exceptions").insert(exceptionRows).select("date, is_available, note")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (slotsInsert.error || exceptionsInsert.error) throw AppError.badRequest("Impossibile salvare la disponibilità");

  return {
    slots: (slotsInsert.data ?? []).map(mapAvailabilitySlotRow),
    exceptions: (exceptionsInsert.data ?? []).map(mapAvailabilityExceptionRow),
  };
}
