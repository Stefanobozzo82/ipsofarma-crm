import type { Message } from "@fido/shared";
import { Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listMessages, sendMessage, subscribeToMessages } from "@/features/chat/api";
import { useAuthStore } from "@/store/auth-store";
import { LoadingView } from "@/components/ui/LoadingView";

/** Porting web di mobile/app/chat/[id].tsx: stessa logica realtime
 * (nessun append ottimistico — il messaggio arriva dalla sottoscrizione
 * anche per chi lo invia, un'unica fonte di verità). */
export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const session = useAuthStore((s) => s.session);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const listEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (status === "signedOut") navigate("/accedi", { state: { from: `/messaggi/${id ?? ""}` } });
  }, [status, id, navigate]);

  useEffect(() => {
    if (!id || !session) return;
    listMessages(id)
      .then(setMessages)
      .catch(() => setError("Non siamo riusciti a caricare la conversazione."));

    const unsubscribe = subscribeToMessages(id, (message) => {
      setMessages((prev) => (prev?.some((m) => m.id === message.id) ? prev : [...(prev ?? []), message]));
    });
    return unsubscribe;
  }, [id, session]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (!session) return <LoadingView />;
  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || !id || !session) return;
    setSending(true);
    setBody("");
    try {
      await sendMessage(id, session.user.id, text);
    } catch {
      setBody(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4.5rem)] max-w-xl flex-col px-6 py-6">
      <h1 className="font-display text-xl font-extrabold text-ink">Messaggi</h1>

      <div className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-line bg-surface p-4">
        {messages === null ? (
          <LoadingView />
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-ink-faint">Nessun messaggio ancora — scrivi il primo!</p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => {
              const isMine = message.senderId === session.user.id;
              return (
                <div key={message.id} className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl border px-3.5 py-2.5 ${
                      isMine ? "border-accent bg-accent text-accent-ink" : "border-line bg-bg text-ink"
                    }`}
                  >
                    <p className="text-sm">{message.body}</p>
                  </div>
                  <span className="mt-1 px-1 text-[11px] text-ink-faint">
                    {new Date(message.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              );
            })}
            <div ref={listEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="mt-4 flex items-center gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Scrivi un messaggio…"
          className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          aria-label="Invia"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition disabled:opacity-50"
        >
          <Send size={18} strokeWidth={2.25} />
        </button>
      </form>
    </div>
  );
}
