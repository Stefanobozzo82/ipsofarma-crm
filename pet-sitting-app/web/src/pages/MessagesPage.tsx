import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listMyConversations, type ConversationWithPartner } from "@/features/chat/api";
import { useAuthStore } from "@/store/auth-store";
import { LoadingView } from "@/components/ui/LoadingView";

function Avatar({ conversation }: { conversation: ConversationWithPartner }) {
  if (conversation.partnerAvatarUrl) {
    return <img src={conversation.partnerAvatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />;
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent">
      <span className="font-display font-bold text-accent-ink">{conversation.partnerName.charAt(0).toUpperCase()}</span>
    </div>
  );
}

/** Elenco conversazioni — porting web di mobile/app/(tabs)/messages.tsx. */
export function MessagesPage() {
  const session = useAuthStore((s) => s.session);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationWithPartner[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "signedOut") navigate("/accedi", { state: { from: "/messaggi" } });
  }, [status, navigate]);

  useEffect(() => {
    if (!session) return;
    listMyConversations(session.user.id)
      .then(setConversations)
      .catch(() => setError("Non siamo riusciti a caricare i messaggi. Riprova."));
  }, [session]);

  if (!session) return <LoadingView />;
  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }
  if (!conversations) return <LoadingView />;

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-display text-2xl font-extrabold text-ink">Messaggi</h1>

      {conversations.length === 0 ? (
        <p className="mt-6 text-sm text-ink-faint">Nessuna conversazione ancora.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              to={`/messaggi/${conversation.id}`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft transition hover:border-accent"
            >
              <Avatar conversation={conversation} />
              <div className="flex-1">
                <p className="font-display font-bold text-ink">{conversation.partnerName}</p>
                {conversation.lastMessageAt ? (
                  <p className="text-xs text-ink-faint">
                    Ultimo messaggio {new Date(conversation.lastMessageAt).toLocaleDateString("it-IT")}
                  </p>
                ) : (
                  <p className="text-xs text-ink-faint">Nessun messaggio ancora</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
