/** Selettore a "chip" orizzontali — stessa idea di ChipRow in
 * mobile/app/sitter-dashboard/services.tsx, qui condivisa tra le pagine
 * web che lo usano (candidatura sitter e gestione listino) invece di
 * duplicata in ognuna. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-4 py-2 text-sm font-display font-bold transition ${
              selected ? "border-accent bg-accent text-accent-ink" : "border-line bg-bg text-ink-muted"
            }`}
          >
            {labels[opt]}
          </button>
        );
      })}
    </div>
  );
}
