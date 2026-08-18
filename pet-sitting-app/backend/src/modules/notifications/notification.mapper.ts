import type { Notification } from "@fido/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNotificationRow(row: any): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}
