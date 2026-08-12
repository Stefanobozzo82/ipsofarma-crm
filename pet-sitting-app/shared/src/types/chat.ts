export interface Conversation {
  id: string;
  ownerId: string;
  sitterId: string;
  bookingId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  readAt: string | null;
  createdAt: string;
}
