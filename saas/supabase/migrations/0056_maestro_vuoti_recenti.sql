-- 0056 — Documenti Maestro "vuoti" letti mentre li stai ancora scrivendo.
-- Un documento senza righe e con totale zero veniva scartato per sempre
-- ("ignorato"): succedeva anche a un ordine appena creato in Maestro, letto
-- dalla sincronizzazione prima che ci fossero le righe (OC 271 dell'11/11/2026,
-- un omaggio a totale zero). Ora, se ha meno di 30 giorni, resta "in attesa" e
-- viene riletto alla sincronizzazione successiva; solo i più vecchi si scartano.
do $x$
declare d text; old text := $o$if jsonb_array_length(v_righe) = 0 and coalesce(maestro_numero(d->>'TOTALE'), 0) = 0 then
                v_esito := 'ignorato';$o$;
  nw text := $n$if jsonb_array_length(v_righe) = 0 and coalesce(maestro_numero(d->>'TOTALE'), 0) = 0 and v_data < current_date - 30 then
                v_esito := 'ignorato';$n$;
begin
  select pg_get_functiondef('public.maestro_import'::regproc) into d;
  if position(nw in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'maestro_import: testo da sostituire non trovato'; end if;
  execute replace(d, old, nw);
end $x$;
