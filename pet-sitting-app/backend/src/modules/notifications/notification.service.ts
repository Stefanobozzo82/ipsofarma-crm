import type { Notification, RegisterPushTokenInput } from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { sendPushNotification } from "../../lib/push";
import { supabaseAdmin } from "../../lib/supabase";
import { mapNotificationRow } from "./notification.mapper";

/**
 * Chiamata da qualunque altro modulo backend per notificare un utente —
 * scrive sempre con supabaseAdmin perché il destinatario quasi mai è
 * l'utente autenticato della richiesta corrente (es. il sitter accetta e
 * va notificato l'owner). Non rilancia mai: una notifica persa non deve
 * far fallire l'azione che l'ha generata (accept/decline restano validi
 * anche se questa scrittura fallisse).
 */
export async function notifyUser(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("notifications")
    .insert({ user_id: userId, type, title, body, data: data ?? null });
  if (error) return;

  const { data: tokens } = await supabaseAdmin.from("push_tokens").select("token").eq("user_id", userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sendPushNotification((tokens ?? []).map((t: any) => t.token), { title, body, data });
}

export async function listMyNotifications(supabase: SupabaseClient): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, body, data, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw AppError.badRequest("Impossibile recuperare le notifiche");
  return (data ?? []).map(mapNotificationRow);
}

export async function markNotificationRead(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  if (error) throw AppError.badRequest("Impossibile aggiornare la notifica");
}

export async function markAllNotificationsRead(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw AppError.badRequest("Impossibile aggiornare le notifiche");
}

export async function registerPushToken(
  supabase: SupabaseClient,
  userId: string,
  input: RegisterPushTokenInput,
): Promise<void> {
  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      { user_id: userId, token: input.token, platform: input.platform, last_used_at: new Date().toISOString() },
      { onConflict: "user_id,token" },
    );
  if (error) throw AppError.badRequest("Impossibile registrare il token");
}
