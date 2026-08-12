import type { CreateMeetGreetInput, MeetGreetRequest, UpdateMeetGreetInput } from "@fido/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../../lib/app-error";
import { mapMeetGreetRow } from "./meet-greet.mapper";

const MEET_GREET_COLUMNS = "id, owner_id, sitter_id, proposed_datetime, status, notes, created_at, updated_at";

export async function createMeetGreet(
  supabase: SupabaseClient,
  ownerId: string,
  input: CreateMeetGreetInput,
): Promise<MeetGreetRequest> {
  const { data: sitter } = await supabase
    .from("sitter_profiles")
    .select("status")
    .eq("user_id", input.sitterId)
    .maybeSingle();
  if (!sitter || sitter.status !== "approved") throw AppError.badRequest("Sitter non disponibile");

  const { data, error } = await supabase
    .from("meet_greet_requests")
    .insert({
      owner_id: ownerId,
      sitter_id: input.sitterId,
      proposed_datetime: input.proposedDatetime,
      notes: input.notes ?? null,
    })
    .select(MEET_GREET_COLUMNS)
    .single();

  if (error || !data) throw AppError.badRequest("Impossibile inviare la richiesta di meet & greet");
  return mapMeetGreetRow(data);
}

export async function listMyMeetGreets(supabase: SupabaseClient): Promise<MeetGreetRequest[]> {
  const { data, error } = await supabase
    .from("meet_greet_requests")
    .select(MEET_GREET_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw AppError.badRequest("Impossibile recuperare le richieste di meet & greet");
  return (data ?? []).map(mapMeetGreetRow);
}

/**
 * Flusso: 'requested' (l'owner propone un orario) → il sitter accetta /
 * rifiuta / ripropone un orario diverso (status 'proposed') → a quel punto
 * tocca all'owner accettare o rifiutare. Un solo giro di controproposta per
 * restare semplici nell'MVP. 'cancel' è sempre permesso a entrambe le parti
 * finché non si è già in uno stato terminale.
 */
export async function updateMeetGreet(
  supabase: SupabaseClient,
  id: string,
  userId: string,
  input: UpdateMeetGreetInput,
): Promise<MeetGreetRequest> {
  const { data: current, error: fetchError } = await supabase
    .from("meet_greet_requests")
    .select("owner_id, sitter_id, status")
    .eq("id", id)
    .single();
  if (fetchError || !current) throw AppError.notFound("Richiesta di meet & greet non trovata");

  const isOwner = current.owner_id === userId;
  const isSitter = current.sitter_id === userId;
  if (!isOwner && !isSitter) throw AppError.forbidden();

  const TERMINAL = ["accepted", "declined", "cancelled"];
  const patch: Record<string, unknown> = {};

  switch (input.action) {
    case "cancel":
      if (TERMINAL.includes(current.status)) throw AppError.conflict("Richiesta già conclusa");
      patch.status = "cancelled";
      break;

    case "propose":
      if (current.status !== "requested") throw AppError.conflict("Puoi riproporre un orario solo su una richiesta iniziale");
      if (!isSitter) throw AppError.forbidden("Solo il sitter può riproporre un orario diverso");
      patch.status = "proposed";
      patch.proposed_datetime = input.proposedDatetime;
      break;

    case "accept":
    case "decline": {
      const actor = current.status === "requested" ? "sitter" : current.status === "proposed" ? "owner" : null;
      if (!actor) throw AppError.conflict(`Non puoi ${input.action === "accept" ? "accettare" : "rifiutare"} da questo stato`);
      if (actor === "sitter" && !isSitter) throw AppError.forbidden("Tocca al sitter rispondere a questa richiesta");
      if (actor === "owner" && !isOwner) throw AppError.forbidden("Tocca al proprietario rispondere alla controproposta");
      patch.status = input.action === "accept" ? "accepted" : "declined";
      break;
    }
  }

  const { data, error } = await supabase
    .from("meet_greet_requests")
    .update(patch)
    .eq("id", id)
    .select(MEET_GREET_COLUMNS)
    .single();

  if (error || !data) throw AppError.badRequest("Impossibile aggiornare la richiesta di meet & greet");
  return mapMeetGreetRow(data);
}
