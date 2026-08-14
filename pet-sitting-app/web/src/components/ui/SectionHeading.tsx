interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}

export function SectionHeading({ eyebrow, title, subtitle, align = "center" }: SectionHeadingProps) {
  const alignClass = align === "center" ? "text-center items-center mx-auto" : "text-left items-start";

  return (
    <div className={`flex flex-col gap-3 max-w-2xl ${alignClass}`}>
      {eyebrow ? <span className="text-sm font-display font-bold uppercase tracking-wide text-accent">{eyebrow}</span> : null}
      <h2 className="text-3xl sm:text-4xl font-extrabold text-ink">{title}</h2>
      {subtitle ? <p className="text-lg text-ink-muted">{subtitle}</p> : null}
    </div>
  );
}
