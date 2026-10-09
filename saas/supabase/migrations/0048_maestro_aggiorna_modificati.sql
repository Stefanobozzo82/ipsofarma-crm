-- Import da Maestro: anche le MODIFICHE a documenti già importati.
--
-- Fino a qui l'import creava solo i documenti nuovi: se in Maestro un ordine
-- (o un DDT, una fattura…) veniva cambiato dopo essere arrivato nel
-- gestionale — una riga tolta, una quantità o un prezzo corretti — il
-- gestionale restava con la versione vecchia. Caso reale: ordine 240 di
-- Tirrenia, Premilene tolto in Maestro un'ora dopo l'import e rimasto tra i
-- "prodotti da evadere" del gestionale.
--
-- Ora a ogni import, per ogni documento già abbinato (esito importato o
-- presente) si confronta il contenuto delle righe in Maestro — codice,
-- quantità, prezzo, sconto, IVA, nell'ordine — con quello visto l'ultima
-- volta (maestro_import_log.contenuto):
--  * uguale: niente da fare;
--  * diverso, e il documento nel gestionale è ancora come la versione
--    precedente di Maestro: le righe del gestionale prendono quelle nuove di
--    Maestro, conservando per ogni articolo ciò che esiste solo nel
--    gestionale (lotto e scadenza se Maestro non li ha, quantità già evasa,
--    collegamento alla riga del DDT, …);
--  * diverso, ma il documento è stato cambiato anche nel gestionale (es.
--    lotti, righe riscritte a mano): non si tocca nulla, il registro
--    dell'import lo segnala come da allineare a mano;
--  * se l'aggiornamento toglierebbe quantità già evase nel gestionale,
--    idem: segnalato, non applicato.
-- La prima volta che un documento passa di qui il suo contenuto in Maestro
-- diventa solo il punto di partenza: i documenti già importati e poi
-- sistemati nel gestionale non vengono riscritti da questa migrazione.

alter table public.maestro_import_log add column if not exists contenuto text;

-- Impronta delle righe: codice, quantità, prezzo, sconto e IVA, in ordine.
-- Descrizione, lotto, scadenza e campi del solo gestionale (qtyEv, …) non
-- contano: non sono "il documento" di Maestro.
create or replace function public.maestro_contenuto(p_righe jsonb) returns text
language sql immutable set search_path = public as $$
  select md5(coalesce(string_agg(
           coalesce(maestro_norm(r->>'cod'), '') || '|' ||
           coalesce(maestro_numtxt(maestro_numero(r->>'qty')), '0') || '|' ||
           coalesce(maestro_numtxt(round(maestro_numero(r->>'prezzo'), 4)), '0') || '|' ||
           coalesce(nullif(nullif(regexp_replace(coalesce(r->>'sconto', ''), '\s', '', 'g'), '0'), ''), '') || '|' ||
           coalesce(maestro_numtxt(maestro_numero(r->>'iva')), '0'),
         '~' order by i), ''))
  from jsonb_array_elements(case when jsonb_typeof(p_righe) = 'array' then p_righe else '[]'::jsonb end) with ordinality x(r, i)
$$;

create or replace function public.maestro_aggiorna_modificati(p_company_id uuid) returns jsonb
language plpgsql set search_path = public as $$
declare
  l record; v_lines text; v_m jsonb; v_sig text; v_g jsonb; v_gsig text; v_new jsonb; v_used integer[];
  v_r jsonb; v_old jsonb; v_j integer; v_ok boolean; v_aggiornati integer := 0; v_da_vedere integer := 0;
  v_motivo text;
begin
  for l in
    select * from maestro_import_log
    where company_id = p_company_id and esito in ('importato', 'presente') and doc_id is not null
      and doc_tipo in ('preventivi', 'ordini_cliente', 'ordini_fornitore', 'ddt', 'fatture_cliente', 'note_credito',
                       'fatture_fornitore', 'note_credito_fornitore')
    order by tabella, numreg
  loop
    v_lines := case l.tabella when 'PREVENTI' then 'ARCART_P' when 'ORDINICL' then 'ARCART_L' when 'ORDINI' then 'ARCART_O'
                              when 'BOLLE' then 'ARCART_B' when 'VENDITE' then 'ARCART_V' when 'ACQUISTI' then 'ARCART_A' end;
    continue when v_lines is null;
    v_m := maestro_righe(p_company_id, v_lines, l.numreg);
    -- Senza righe (fattura differita, documento eliminato in Maestro): niente da confrontare.
    continue when jsonb_array_length(v_m) = 0;
    v_sig := maestro_contenuto(v_m);
    if l.contenuto is null then
      update maestro_import_log set contenuto = v_sig
      where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
      continue;
    end if;
    continue when l.contenuto = v_sig;

    execute format('select righe from public.%I where company_id = $1 and id = $2 for update', l.doc_tipo)
      into v_g using p_company_id, l.doc_id;
    continue when v_g is null;
    v_gsig := maestro_contenuto(v_g);
    v_motivo := null;

    if v_gsig = v_sig then
      -- Già allineato (es. sistemato a mano anche nel gestionale).
      update maestro_import_log set contenuto = v_sig
      where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
      continue;
    elsif v_gsig <> l.contenuto then
      v_motivo := 'modificato in Maestro dopo l''import, ma cambiato anche nel gestionale: da allineare a mano';
    else
      -- Righe nuove di Maestro; per ogni articolo si riprende la riga del
      -- gestionale con lo stesso codice (la prima non ancora usata) per non
      -- perdere ciò che esiste solo qui.
      v_new := '[]'::jsonb; v_used := '{}'; v_ok := true;
      for v_r in select r from jsonb_array_elements(v_m) r loop
        v_old := null;
        select g, i into v_old, v_j from jsonb_array_elements(v_g) with ordinality y(g, i)
        where not (i::integer = any(v_used)) and coalesce(maestro_norm(g->>'cod'), '') = coalesce(maestro_norm(v_r->>'cod'), '')
        order by i limit 1;
        if v_old is not null then
          v_used := v_used || v_j;
          if coalesce(v_r->>'lotto', '') = '' then v_r := v_r - 'lotto' - 'scad'; end if;
          if coalesce(maestro_numero(v_old->>'qtyEv'), 0) > coalesce(maestro_numero(v_r->>'qty'), 0) then v_ok := false; end if;
          v_r := v_old || v_r;
        end if;
        v_new := v_new || jsonb_build_array(v_r);
      end loop;
      -- Righe del gestionale che spariscono: non devono avere quantità già evase.
      if exists (select 1 from jsonb_array_elements(v_g) with ordinality y(g, i)
                 where not (i::integer = any(v_used)) and coalesce(maestro_numero(g->>'qtyEv'), 0) > 0) then
        v_ok := false;
      end if;
      if not v_ok then
        v_motivo := 'modificato in Maestro dopo l''import, ma toglierebbe quantità già evase nel gestionale: da allineare a mano';
      else
        begin
          execute format('update public.%I set righe = $3 where company_id = $1 and id = $2', l.doc_tipo)
            using p_company_id, l.doc_id, v_new;
          update maestro_import_log set contenuto = v_sig,
                 motivo = 'aggiornato da Maestro il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
                 updated_at = now()
          where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
          v_aggiornati := v_aggiornati + 1;
          continue;
        exception when others then
          v_motivo := 'modificato in Maestro dopo l''import, aggiornamento non riuscito: ' || sqlerrm;
        end;
      end if;
    end if;

    -- Da vedere a mano: lo si scrive una volta, senza riscriverlo a ogni giro.
    update maestro_import_log set motivo = v_motivo, updated_at = now()
    where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg and motivo is distinct from v_motivo;
    v_da_vedere := v_da_vedere + 1;
  end loop;
  return jsonb_build_object('aggiornati', v_aggiornati, 'da_allineare', v_da_vedere);
end;
$$;
revoke all on function public.maestro_aggiorna_modificati(uuid) from public, anon, authenticated;
revoke all on function public.maestro_contenuto(jsonb) from public, anon, authenticated;
grant execute on function public.maestro_aggiorna_modificati(uuid) to service_role;
grant execute on function public.maestro_contenuto(jsonb) to service_role;

-- maestro_import la chiama dopo aver creato i documenti nuovi e prima di
-- riportare evasioni e incassi (che lavorano sulle righe aggiornate).
do $$
declare def text; nuova text;
begin
  def := pg_get_functiondef('public.maestro_import(uuid,date)'::regprocedure);
  nuova := replace(def, '  v_incassi := maestro_sync_incassi(p_company_id);',
                        '  perform maestro_aggiorna_modificati(p_company_id);' || chr(10) || '  v_incassi := maestro_sync_incassi(p_company_id);');
  if nuova = def then raise exception 'maestro_import: punto da modificare non trovato'; end if;
  execute nuova;
end$$;

-- Punto di partenza: il contenuto attuale in Maestro di tutti i documenti già
-- importati (nessun documento viene modificato qui).
select public.maestro_aggiorna_modificati(c) from (select distinct company_id c from public.maestro_import_log) x;
