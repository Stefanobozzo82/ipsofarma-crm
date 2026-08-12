import type { Booking, CancelBookingInput, CreateBookingInput, DeclineBookingInput } from "@fido/shared";
import { apiFetch } from "@/lib/api";

export function createBooking(input: CreateBookingInput): Promise<Booking> {
  return apiFetch<Booking>("/bookings", { method: "POST", body: input });
}

export function listMyBookings(status?: string): Promise<Booking[]> {
  return apiFetch<Booking[]>("/bookings", { query: status ? { status } : undefined });
}

export function getBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}`);
}

export function acceptBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/accept`, { method: "PATCH" });
}

export function declineBooking(id: string, input: DeclineBookingInput): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/decline`, { method: "PATCH", body: input });
}

export function cancelBooking(id: string, input: CancelBookingInput): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/cancel`, { method: "PATCH", body: input });
}

export function payBooking(id: string): Promise<{ clientSecret: string }> {
  return apiFetch<{ clientSecret: string }>(`/bookings/${id}/pay`, { method: "POST" });
}

export function startBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/start`, { method: "PATCH" });
}

export function completeBooking(id: string): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${id}/complete`, { method: "PATCH" });
}
