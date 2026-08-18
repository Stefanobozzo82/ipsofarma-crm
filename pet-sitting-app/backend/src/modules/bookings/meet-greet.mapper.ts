import type { MeetGreetRequest } from "@fido/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapMeetGreetRow(row: any): MeetGreetRequest {
  return {
    id: row.id,
    ownerId: row.owner_id,
    sitterId: row.sitter_id,
    proposedDatetime: row.proposed_datetime,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
