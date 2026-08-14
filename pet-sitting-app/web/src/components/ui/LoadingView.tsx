import { Loader2 } from "lucide-react";

export function LoadingView() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-24">
      <Loader2 size={24} className="animate-spin text-accent" />
      <span className="text-sm text-ink-faint">Caricamento…</span>
    </div>
  );
}
