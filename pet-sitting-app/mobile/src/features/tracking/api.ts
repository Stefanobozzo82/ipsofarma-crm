import type { CreateServiceUpdateInput, GpsTrack, ServiceUpdate } from "@fido/shared";
import { apiFetch } from "@/lib/api";

export function listServiceUpdates(bookingId: string): Promise<ServiceUpdate[]> {
  return apiFetch<ServiceUpdate[]>(`/bookings/${bookingId}/updates`);
}

export function addServiceUpdate(bookingId: string, input: CreateServiceUpdateInput): Promise<ServiceUpdate> {
  return apiFetch<ServiceUpdate>(`/bookings/${bookingId}/updates`, { method: "POST", body: input });
}

export function getGpsTrack(bookingId: string): Promise<GpsTrack | null> {
  return apiFetch<GpsTrack | null>(`/bookings/${bookingId}/gps`);
}

export function startGpsTrack(bookingId: string): Promise<GpsTrack> {
  return apiFetch<GpsTrack>(`/bookings/${bookingId}/gps/start`, { method: "POST" });
}

export function pingGpsTrack(bookingId: string, lat: number, lng: number): Promise<GpsTrack> {
  return apiFetch<GpsTrack>(`/bookings/${bookingId}/gps/ping`, { method: "POST", body: { lat, lng } });
}

export function stopGpsTrack(bookingId: string): Promise<GpsTrack> {
  return apiFetch<GpsTrack>(`/bookings/${bookingId}/gps/stop`, { method: "POST" });
}
