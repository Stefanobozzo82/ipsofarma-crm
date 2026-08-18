import type { Notification, RegisterPushTokenInput } from "@fido/shared";
import { apiFetch } from "@/lib/api";

export function listNotifications(): Promise<Notification[]> {
  return apiFetch<Notification[]>("/notifications");
}

export function markNotificationRead(id: string): Promise<void> {
  return apiFetch<void>(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead(): Promise<void> {
  return apiFetch<void>("/notifications/read-all", { method: "PATCH" });
}

export function registerPushToken(input: RegisterPushTokenInput): Promise<void> {
  return apiFetch<void>("/notifications/push-tokens", { method: "POST", body: input });
}
