-- Split payment (scissione dei pagamenti, art. 17-ter DPR 633/72).
--
-- Una fattura cliente in split payment porta extra.split = true: l'IVA la
-- versa l'ente all'Erario, quindi al cliente si incassa solo l'imponibile
-- (come la colonna "Totale" di Maestro). Il documento resta lo stesso —
-- righe con la loro IVA, totale documento invariato — cambia solo quanto
-- c'è da incassare.
--
--  * invoice_due_total(doc): totale da incassare di una fattura (riga
--    intera della tabella in jsonb), imponibile se split, altrimenti lordo;
--  * mutate_invoice_payment e synchronize_credit_payment_state lo usano al
--    posto del lordo per decidere saldo e "salda tutto";
--  * maestro_crea_documento segna split le fatture importate da Maestro per
--    i clienti che in anagrafica hanno "Scissione pagamenti" = Sì.
--
-- Le funzioni esistenti si riscrivono partendo dalla loro definizione
-- attuale (pg_get_functiondef), cambiando solo il punto indicato: così
-- restano identiche in tutto il resto, permessi compresi. Se il testo da
-- sostituire non c'è più la migrazione si ferma invece di proseguire a metà.

create or replace function public.invoice_due_total(p_doc jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
begin
 if p_doc#>>'{extra,split}'='true' then
  return public.invoice_gross_total(coalesce((
   select jsonb_agg(r||jsonb_build_object('iva',0)) from jsonb_array_elements(p_doc->'righe') r
  ),'[]'::jsonb));
 end if;
 return public.invoice_gross_total(p_doc->'righe');
end$$;
revoke all on function public.invoice_due_total(jsonb) from public,anon,authenticated;
grant execute on function public.invoice_due_total(jsonb) to service_role;

do $$
declare
 def text; nuova text;
begin
 def := pg_get_functiondef('public.mutate_invoice_payment(uuid,text,uuid,uuid,text,jsonb)'::regprocedure);
 nuova := replace(def, $r$gross:=public.invoice_gross_total(doc->'righe');$r$, $r$gross:=public.invoice_due_total(doc);$r$);
 if nuova = def then raise exception 'mutate_invoice_payment: punto da modificare non trovato'; end if;
 execute nuova;

 def := pg_get_functiondef('public.synchronize_credit_payment_state()'::regprocedure);
 nuova := replace(def, $r$gross:=public.invoice_gross_total(invoice->'righe');$r$, $r$gross:=public.invoice_due_total(invoice);$r$);
 if nuova = def then raise exception 'synchronize_credit_payment_state: punto da modificare non trovato'; end if;
 execute nuova;

 select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'maestro_crea_documento';
 -- Ambienti senza l'import da Maestro (es. staging): niente da adattare.
 if def is null then return; end if;
 nuova := replace(def,
  $r$v_ddt.oc_id, v_righe, v_paid, v_paid_date, v_pagamenti,
            jsonb_build_object('note', v_note))$r$,
  $r$v_ddt.oc_id, v_righe, v_paid, v_paid_date, v_pagamenti,
            jsonb_build_object('note', v_note)
            || case when exists (select 1 from public.clienti c where c.id = p_party and c.split = 'si')
                    then jsonb_build_object('split', true) else '{}'::jsonb end)$r$);
 if nuova = def then raise exception 'maestro_crea_documento: punto da modificare non trovato'; end if;
 execute nuova;
end$$;

notify pgrst, 'reload schema';
