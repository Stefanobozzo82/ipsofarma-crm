import { create } from "zustand";

interface UnreadMessagesState {
  hasUnread: boolean;
  markUnread: () => void;
  clear: () => void;
}

/** Un solo booleano, non un conteggio per conversazione — il badge è un
 * puntino "hai messaggi nuovi da leggere", non un contatore preciso: basta
 * a far sapere che è arrivato qualcosa senza dover tracciare letto/non
 * letto per singolo messaggio (che richiederebbe scrivere su `read_at`,
 * fuori scope qui). Si azzera aprendo /messaggi o una singola chat. */
export const useUnreadMessagesStore = create<UnreadMessagesState>((set) => ({
  hasUnread: false,
  markUnread: () => set({ hasUnread: true }),
  clear: () => set({ hasUnread: false }),
}));
