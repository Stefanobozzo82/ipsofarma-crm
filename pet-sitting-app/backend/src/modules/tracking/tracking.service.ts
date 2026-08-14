import type {
  CreateServiceUpdateInput,
  GpsPingInput,
  GpsPoint,
  GpsTrack,
  RequestServicePhotoUploadInput,
  ServiceUpdate,
} from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { notifyUser } from "../notifications/notification.service";
import { mapGpsTrackRow, mapServiceUpdateRow } from "./tracking.mapper";

async function requireSitterOfBooking(supabase: SupabaseClient, bookingId: string, sitterId: string) {
  const { data, error } = await supabase.from("bookings").select("owner_id, sitter_id").eq("id", bookingId).single();
  if (error || !data) throw AppError.notFound("Prenotazione non trovata");
  if (data.sitter_id !== sitterId) throw AppError.forbidden("Solo il sitter assegnato può farlo");
  return data;
}

function haversineKm(a: GpsPoint, b: GpsPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function totalDistanceKm(points: GpsPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return Math.round(total * 100) / 100;
}

const UPDATE_COLUMNS = "id, booking_id, type, note, photo_urls, created_at";

export async function addServiceUpdate(
  supabase: SupabaseClient,
  bookingId: string,
  sitterId: string,
  input: CreateServiceUpdateInput,
): Promise<ServiceUpdate> {
  const booking = await requireSitterOfBooking(supabase, bookingId, sitterId);

  const { data, error } = await supabase
    .from("service_updates")
    .insert({ booking_id: bookingId, type: input.type, note: input.note ?? null, photo_urls: input.photoUrls })
    .select(UPDATE_COLUMNS)
    .single();
  if (error || !data) throw AppError.badRequest("Impossibile registrare l'aggiornamento");

  await notifyUser(booking.owner_id, "service_update", "Aggiornamento dal sitter", input.note ?? "Nuovo aggiornamento sul servizio", {
    bookingId,
  });

  return mapServiceUpdateRow(data);
}

export async function listServiceUpdates(supabase: SupabaseClient, bookingId: string): Promise<ServiceUpdate[]> {
  const { data, error } = await supabase
    .from("service_updates")
    .select(UPDATE_COLUMNS)
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) throw AppError.badRequest("Impossibile recuperare gli aggiornamenti");
  return (data ?? []).map(mapServiceUpdateRow);
}

export async function requestServicePhotoUpload(
  supabase: SupabaseClient,
  bookingId: string,
  sitterId: string,
  input: RequestServicePhotoUploadInput,
): Promise<{ uploadUrl: string; token: string; path: string }> {
  await requireSitterOfBooking(supabase, bookingId, sitterId);

  const path = `${bookingId}/${Date.now()}.${input.fileExt}`;
  const { data, error } = await supabase.storage.from("service-photos").createSignedUploadUrl(path);
  if (error || !data) throw AppError.badRequest("Impossibile generare l'URL di upload");

  return { uploadUrl: data.signedUrl, token: data.token, path };
}

const TRACK_COLUMNS = "id, booking_id, points, distance_km, started_at, ended_at";

export async function startGpsTrack(supabase: SupabaseClient, bookingId: string, sitterId: string): Promise<GpsTrack> {
  await requireSitterOfBooking(supabase, bookingId, sitterId);

  const { data, error } = await supabase
    .from("gps_tracks")
    .upsert({ booking_id: bookingId, points: [], started_at: new Date().toISOString(), ended_at: null }, { onConflict: "booking_id" })
    .select(TRACK_COLUMNS)
    .single();
  if (error || !data) throw AppError.badRequest("Impossibile avviare il tracking");
  return mapGpsTrackRow(data);
}

export async function pingGpsTrack(
  supabase: SupabaseClient,
  bookingId: string,
  sitterId: string,
  input: GpsPingInput,
): Promise<GpsTrack> {
  await requireSitterOfBooking(supabase, bookingId, sitterId);

  const { data: existing, error: fetchError } = await supabase
    .from("gps_tracks")
    .select("points")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (fetchError) throw AppError.badRequest("Traccia non trovata — avvia il tracking prima di inviare un punto");

  const points: GpsPoint[] = existing?.points ?? [];
  points.push({ lat: input.lat, lng: input.lng, t: new Date().toISOString() });

  const { data, error } = await supabase
    .from("gps_tracks")
    .upsert({ booking_id: bookingId, points }, { onConflict: "booking_id" })
    .select(TRACK_COLUMNS)
    .single();
  if (error || !data) throw AppError.badRequest("Impossibile registrare il punto GPS");
  return mapGpsTrackRow(data);
}

export async function stopGpsTrack(supabase: SupabaseClient, bookingId: string, sitterId: string): Promise<GpsTrack> {
  await requireSitterOfBooking(supabase, bookingId, sitterId);

  const { data: existing, error: fetchError } = await supabase
    .from("gps_tracks")
    .select("points")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (fetchError || !existing) throw AppError.notFound("Nessun tracking in corso per questa prenotazione");

  const points: GpsPoint[] = existing.points ?? [];
  const distanceKm = totalDistanceKm(points);

  const { data, error } = await supabase
    .from("gps_tracks")
    .update({ ended_at: new Date().toISOString(), distance_km: distanceKm })
    .eq("booking_id", bookingId)
    .select(TRACK_COLUMNS)
    .single();
  if (error || !data) throw AppError.badRequest("Impossibile chiudere il tracking");
  return mapGpsTrackRow(data);
}

export async function getGpsTrack(supabase: SupabaseClient, bookingId: string): Promise<GpsTrack | null> {
  const { data, error } = await supabase.from("gps_tracks").select(TRACK_COLUMNS).eq("booking_id", bookingId).maybeSingle();
  if (error) throw AppError.badRequest("Impossibile recuperare il tracking");
  return data ? mapGpsTrackRow(data) : null;
}
