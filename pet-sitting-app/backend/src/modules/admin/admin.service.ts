import type {
  AdminReview,
  AdminStats,
  ApproveSitterInput,
  Dispute,
  ModerateReviewInput,
  PendingSitterApplication,
  ResolveDisputeInput,
} from "@fido/shared";
import { AppError } from "../../lib/app-error";
import { supabaseAdmin } from "../../lib/supabase";
import { mapDisputeRow } from "./admin.mapper";

/** Tutte le funzioni qui usano supabaseAdmin (bypassa RLS) di proposito:
 * sono operazioni privilegiate raggiungibili solo dietro requireAdmin.
 * Ogni azione con effetto (approvazione, moderazione, risoluzione dispute)
 * finisce in admin_action_logs — l'unico modo per un utente normale di
 * vedere quella tabella è non vederla affatto (nessuna policy pubblica). */
async function logAdminAction(adminId: string, action: string, targetType: string, targetId: string, notes?: string) {
  const { error } = await supabaseAdmin
    .from("admin_action_logs")
    .insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, notes: notes ?? null });
  if (error) throw AppError.badRequest("Azione eseguita ma non registrata nell'audit log");
}

export async function listPendingSitters(): Promise<PendingSitterApplication[]> {
  const { data, error } = await supabaseAdmin
    .from("sitter_profiles")
    .select("user_id, bio, experience_years, address, service_radius_km, created_at, users!inner(first_name, last_name, email)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw AppError.badRequest("Impossibile recuperare le candidature");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    userId: row.user_id,
    firstName: row.users.first_name,
    lastName: row.users.last_name,
    email: row.users.email,
    bio: row.bio,
    experienceYears: row.experience_years,
    address: row.address,
    serviceRadiusKm: row.service_radius_km,
    createdAt: row.created_at,
  }));
}

export async function approveSitter(adminId: string, sitterId: string, input: ApproveSitterInput): Promise<void> {
  const status = input.approve ? "approved" : "rejected";
  const { data, error } = await supabaseAdmin
    .from("sitter_profiles")
    .update({ status, approved_at: input.approve ? new Date().toISOString() : null, approved_by: adminId })
    .eq("user_id", sitterId)
    .eq("status", "pending")
    .select("user_id")
    .single();

  if (error || !data) throw AppError.badRequest("Candidatura non trovata o già valutata");
  await logAdminAction(adminId, input.approve ? "sitter_approved" : "sitter_rejected", "sitter_profile", sitterId, input.reason);
}

export async function listReviewsForModeration(): Promise<AdminReview[]> {
  const { data, error } = await supabaseAdmin
    .from("reviews")
    .select("id, booking_id, reviewer_first_name, reviewee_id, direction, rating, comment, is_hidden, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw AppError.badRequest("Impossibile recuperare le recensioni");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    bookingId: row.booking_id,
    reviewerFirstName: row.reviewer_first_name,
    revieweeId: row.reviewee_id,
    direction: row.direction,
    rating: row.rating,
    comment: row.comment,
    isHidden: row.is_hidden,
    createdAt: row.created_at,
  }));
}

export async function moderateReview(adminId: string, reviewId: string, input: ModerateReviewInput): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("reviews")
    .update({ is_hidden: input.isHidden })
    .eq("id", reviewId)
    .select("id")
    .single();

  if (error || !data) throw AppError.notFound("Recensione non trovata");
  await logAdminAction(adminId, input.isHidden ? "review_hidden" : "review_unhidden", "review", reviewId, input.notes);
}

const DISPUTE_COLUMNS = "id, booking_id, opened_by, reason, description, status, resolution, resolved_by, created_at, resolved_at";

export async function listDisputes(status?: string): Promise<Dispute[]> {
  let query = supabaseAdmin.from("disputes").select(DISPUTE_COLUMNS).order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw AppError.badRequest("Impossibile recuperare le dispute");
  return (data ?? []).map(mapDisputeRow);
}

export async function resolveDispute(adminId: string, disputeId: string, input: ResolveDisputeInput): Promise<Dispute> {
  const isTerminal = input.status === "resolved" || input.status === "closed";

  const { data, error } = await supabaseAdmin
    .from("disputes")
    .update({
      status: input.status,
      resolution: input.resolution ?? null,
      resolved_by: adminId,
      resolved_at: isTerminal ? new Date().toISOString() : null,
    })
    .eq("id", disputeId)
    .select(DISPUTE_COLUMNS)
    .single();

  if (error || !data) throw AppError.notFound("Dispute non trovata");
  await logAdminAction(adminId, `dispute_${input.status}`, "dispute", disputeId, input.resolution);
  return mapDisputeRow(data);
}

export async function getStats(): Promise<AdminStats> {
  const [
    totalUsersRes,
    totalOwnersRes,
    totalSittersRes,
    pendingSitterApplicationsRes,
    totalBookingsRes,
    completedBookingsRes,
    openDisputesRes,
    capturedPaymentsRes,
  ] = await Promise.all([
    supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("owner_profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("sitter_profiles").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabaseAdmin.from("sitter_profiles").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabaseAdmin.from("bookings").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("bookings").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabaseAdmin.from("disputes").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabaseAdmin.from("bookings").select("price_total").eq("payment_status", "captured"),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gmv = (capturedPaymentsRes.data ?? []).reduce((sum: number, b: any) => sum + Number(b.price_total), 0);

  return {
    totalUsers: totalUsersRes.count ?? 0,
    totalOwners: totalOwnersRes.count ?? 0,
    totalSitters: totalSittersRes.count ?? 0,
    pendingSitterApplications: pendingSitterApplicationsRes.count ?? 0,
    totalBookings: totalBookingsRes.count ?? 0,
    completedBookings: completedBookingsRes.count ?? 0,
    grossMerchandiseValue: gmv,
    openDisputes: openDisputesRes.count ?? 0,
  };
}
