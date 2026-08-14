import type { Conversation, Message } from "@fido/shared";
import { supabase } from "@/lib/supabase";

/**
 * A differenza degli altri moduli features/*, questo parla direttamente
 * con Supabase (client + Realtime), non con il backend Express — vedi la
 * nota in supabase/migrations/20260812170000_chat.sql sul perché.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConversationRow(row: any): Conversation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    sitterId: row.sitter_id,
    bookingId: row.booking_id,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMessageRow(row: any): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    attachmentUrl: row.attachment_url,
    attachmentType: row.attachment_type,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export interface ConversationWithPartner extends Conversation {
  partnerId: string;
  partnerName: string;
  partnerAvatarUrl: string | null;
}

export async function listMyConversations(myId: string): Promise<ConversationWithPartner[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;

  const conversations = (data ?? []).map(mapConversationRow);
  const partnerIds = Array.from(new Set(conversations.map((c) => (c.ownerId === myId ? c.sitterId : c.ownerId))));
  if (partnerIds.length === 0) return [];

  const { data: users } = await supabase.from("users").select("id, first_name, avatar_url").in("id", partnerIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map((users ?? []).map((u: any) => [u.id, u]));

  return conversations.map((c) => {
    const partnerId = c.ownerId === myId ? c.sitterId : c.ownerId;
    const partner = byId.get(partnerId);
    return {
      ...c,
      partnerId,
      partnerName: partner?.first_name ?? "Utente Fido",
      partnerAvatarUrl: partner?.avatar_url ?? null,
    };
  });
}

/** Trova o crea la conversazione tra due parti — l'ordine owner/sitter va
 * dedotto dal chiamante (chi apre la chat dal profilo pubblico di un
 * sitter è owner; chi la apre dalla propria dashboard sitter è sitter). */
export async function getOrCreateConversation(ownerId: string, sitterId: string): Promise<Conversation> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("sitter_id", sitterId)
    .maybeSingle();
  if (existing) return mapConversationRow(existing);

  const { data, error } = await supabase
    .from("conversations")
    .insert({ owner_id: ownerId, sitter_id: sitterId })
    .select("*")
    .single();
  if (error) throw error;
  return mapConversationRow(data);
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapMessageRow);
}

export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select("*")
    .single();
  if (error) throw error;
  return mapMessageRow(data);
}

/** Ritorna una funzione di cleanup — chiamarla nell'unmount/useEffect return. */
export function subscribeToMessages(conversationId: string, onInsert: (message: Message) => void): () => void {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => onInsert(mapMessageRow(payload.new)),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
