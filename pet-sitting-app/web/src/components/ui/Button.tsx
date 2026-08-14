import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "secondary" | "text";

// disabled:pointer-events-none oltre a disabled:opacity-60: senza, un <Button
// to="..."> disabilitato (Link non supporta l'attributo HTML "disabled", solo
// <button>) resterebbe comunque cliccabile — qui non capita ancora (nessun
// Link viene reso "disabled" oggi), ma tiene il comportamento coerente se
// succedesse in futuro, oltre a spegnere anche l'hover sui <button> reali.
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-display font-bold transition active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none";

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
 * come `<a>` quando c'è un `href` (link esterno/anchor in-pagina, sempre un
 * caricamento pagina completo), `Link` di react-router quando c'è un `to`
 * (navigazione verso un'altra pagina del sito senza ricaricare, es.
 * "Registrati ora" → /registrati), o `<button>` altrimenti (azioni JS, es.
 * submit di un modulo). */
type ButtonProps = CommonProps &
  (
    | ({ to: string } & Omit<LinkProps, "className" | "children" | "to">)
    | ({ href: string; to?: undefined } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children">)
    | ({ href?: undefined; to?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">)
  );

export function Button({ variant = "primary", children, className = "", ...rest }: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${className}`;

  if ("to" in rest && rest.to !== undefined) {
    return (
      <Link className={classes} {...(rest as LinkProps)}>
        {children}
      </Link>
    );
  }

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
