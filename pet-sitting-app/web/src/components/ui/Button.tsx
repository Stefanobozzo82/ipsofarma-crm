import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "text";

const base = "inline-flex items-center justify-center gap-2 rounded-xl font-display font-bold transition active:scale-[0.97]";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90 px-5 py-3",
  secondary: "border-[1.5px] border-accent text-accent bg-transparent hover:bg-accent-soft px-5 py-3",
  text: "text-accent hover:text-accent/80 px-1 py-2",
};

interface CommonProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

/** Come i Button dell'app mobile: stesse 3 varianti (primary pieno,
 * secondary a bordo, text senza sfondo), stesso vocabolario visivo — qui
 * come `<a>` quando c'è un `href` (per link/anchor) o `<button>` altrimenti
 * (per azioni JS, es. submit del modulo di ricerca). */
type ButtonProps = CommonProps &
  (
    | ({ href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children">)
    | ({ href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">)
  );

export function Button({ variant = "primary", children, className = "", ...rest }: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${className}`;

  if ("href" in rest && rest.href !== undefined) {
    return (
      <a className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
