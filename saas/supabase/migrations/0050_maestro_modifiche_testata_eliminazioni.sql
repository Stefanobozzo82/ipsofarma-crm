-- Import da Maestro: oltre alle righe (0048/0049) si riportano nel gestionale
-- anche data e controparte (cliente o fornitore) cambiate in Maestro, e i
-- documenti eliminati in Maestro.
--
-- Testata. Come per le righe, maestro_import_log ricorda com'era la testata
-- in Maestro l'ultima volta (testata) e com'erano data e controparte del
-- documento nel gestionale in quel momento (doc_data, doc_party). Se la
-- testata cambia in Maestro e il documento nel gestionale ha ancora data e
-- controparte di allora, si aggiornano; se sono state cambiate anche nel
-- gestionale, o la data nuova cambierebbe anno (il numero, es. FT/2026/…,
-- porta l'anno), o il cliente/fornitore nuovo non si riconosce, si segnala
-- da allineare a mano.
--
-- Eliminazioni. Un documento è eliminato in Maestro quando il suo record di
-- testata è marcato eliminato nell'archivio di Maestro e non ne esiste uno
-- valido con lo stesso numero di registrazione (un record che manca e basta
-- non conta: potrebbe essere un file arrivato a metà). Nel gestionale si
-- elimina solo se non ha nulla che ne dipende — incassi, merce evasa,
-- documenti generati da lui, note di credito collegate, invio allo SDI — e
-- se nessun altro documento di Maestro è abbinato allo stesso documento del
-- gestionale (Maestro a volte elimina e ricrea con un'altra registrazione).
-- Altrimenti si segnala.

alter table public.maestro_import_log
  add column if not exists testata text,
  add column if not exists doc_data date,
  add column if not exists doc_party uuid;

create or replace function public.maestro_testata(p_tabella text, d jsonb) returns text
language sql immutable set search_path = public as $$
  select md5(coalesce(coalesce(maestro_data(d->>'DATAFAT'),
                               case when d->>'N_DATAFAT' ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'N_DATAFAT')::date end)::text, '') || '|' ||
             coalesce(btrim(d->>case when p_tabella in ('ORDINI', 'ACQUISTI') then 'NUMFOR' else 'NUMCLI' end), '') || '|' ||
             coalesce(maestro_piva(d->>'PIVACF'), '') || '|' ||
             coalesce(maestro_norm(d->>case when p_tabella in ('ORDINI', 'ACQUISTI') then 'FORNITORE' else 'CLIENTE' end), ''))
$$;

-- Controparte del gestionale per una testata di Maestro: quella già usata
-- dagli altri documenti con lo stesso codice cliente/fornitore di Maestro
-- (la più frequente, senza pareggi), altrimenti per P.IVA, altrimenti per nome.
create or replace function public.maestro_controparte(p_company_id uuid, p_tabella text, d jsonb) returns uuid
language plpgsql stable set search_path = public as $$
declare v_kind text; v_tab text; v_code text; v_id uuid;
begin
  v_kind := case when p_tabella in ('ORDINI', 'ACQUISTI') then 'F' else 'C' end;
  v_tab := case v_kind when 'C' then 'clienti' else 'fornitori' end;
  v_code := nullif(btrim(d->>case v_kind when 'C' then 'NUMCLI' else 'NUMFOR' end), '');
  if v_code is not null then
    -- La più frequente, solo se non è a pari merito con un'altra.
    select case when count(*) = 1 or (array_agg(n order by n desc))[1] > (array_agg(n order by n desc))[2]
                then (array_agg(party order by n desc))[1] end
      into v_id
    from (select l.doc_party party, count(*) n
          from maestro_import_log l
          join maestro_records m on m.company_id = l.company_id and m.tabella = l.tabella and not m.deleted
                                 and m.dati->>'NUMREG' = l.numreg::text
          where l.company_id = p_company_id and l.doc_party is not null
            and not (l.tabella = p_tabella and l.numreg::text = d->>'NUMREG')  -- il documento stesso non conta
            and (case when l.tabella in ('ORDINI', 'ACQUISTI') then 'F' else 'C' end) = v_kind
            and btrim(m.dati->>case v_kind when 'C' then 'NUMCLI' else 'NUMFOR' end) = v_code
          group by l.doc_party) x;
    if v_id is not null then return v_id; end if;
  end if;
  if maestro_piva(d->>'PIVACF') is not null then
    execute format('select id from public.%I where company_id = $1 and (maestro_piva(piva) = $2 or maestro_piva(cf) = $2) order by created_at limit 1', v_tab)
      into v_id using p_company_id, maestro_piva(d->>'PIVACF');
    if v_id is not null then return v_id; end if;
  end if;
  if maestro_norm(d->>case v_kind when 'C' then 'CLIENTE' else 'FORNITORE' end) is not null then
    execute format('select id from public.%I where company_id = $1 and maestro_norm(nome) = $2 order by created_at limit 1', v_tab)
      into v_id using p_company_id, maestro_norm(d->>case v_kind when 'C' then 'CLIENTE' else 'FORNITORE' end);
  end if;
  return v_id;
end;
$$;

-- Il documento del gestionale ha qualcosa che ne dipende? (allora non si elimina)
create or replace function public.maestro_documento_vincolato(p_company_id uuid, p_tipo text, p_id uuid) returns text
language plpgsql stable set search_path = public as $$
declare v jsonb;
begin
  execute format('select to_jsonb(t) from public.%I t where company_id = $1 and id = $2', p_tipo) into v using p_company_id, p_id;
  if v is null then return null; end if;
  if p_tipo in ('ordini_cliente', 'ordini_fornitore') and exists (
       select 1 from jsonb_array_elements(coalesce(v->'righe', '[]')) r where coalesce(maestro_numero(r->>'qtyEv'), 0) > 0) then
    return 'merce già evasa';
  end if;
  if p_tipo = 'preventivi' and exists (select 1 from ordini_cliente where company_id = p_company_id and prev_id = p_id) then
    return 'trasformato in ordine';
  end if;
  if p_tipo = 'ordini_cliente' and (exists (select 1 from ddt where company_id = p_company_id and oc_id = p_id)
       or exists (select 1 from fatture_cliente where company_id = p_company_id and oc_id = p_id)
       or exists (select 1 from ordini_fornitore where company_id = p_company_id and extra->>'ocId' = v->>'num')) then
    return 'ha DDT, fatture o ordini fornitore collegati';
  end if;
  if p_tipo = 'ordini_fornitore' and (exists (select 1 from fatture_fornitore where company_id = p_company_id and of_id = p_id)
       or exists (select 1 from ddt_fornitore where company_id = p_company_id and of_id = p_id)
       or jsonb_array_length(coalesce(v->'ftf_ids', '[]')) > 0) then
    return 'ha DDT o fatture fornitore collegati';
  end if;
  if p_tipo = 'ddt' and (exists (select 1 from fatture_cliente where company_id = p_company_id and ddt_id = p_id)
       or coalesce(v#>>'{extra,ftId}', '') <> '') then
    return 'già fatturato';
  end if;
  if p_tipo in ('fatture_cliente', 'fatture_fornitore') then
    if coalesce((v->>'paid')::boolean, false) or jsonb_array_length(coalesce(v->'pagamenti', '[]')) > 0 then return 'ha incassi o pagamenti'; end if;
    if exists (select 1 from note_credito where company_id = p_company_id and fattura_id = p_id)
       or exists (select 1 from note_credito_fornitore where company_id = p_company_id and fattura_id = p_id) then
      return 'ha note di credito collegate';
    end if;
    if p_tipo = 'fatture_cliente' and coalesce(v->>'sdi_progressivo', '') <> '' then return 'già inviata allo SDI'; end if;
  end if;
  return null;
end;
$$;

create or replace function public.maestro_aggiorna_modificati(p_company_id uuid) returns jsonb
language plpgsql set search_path = public as $$
declare
  l record; h jsonb; v_lines text; v_m jsonb; v_sig text; v_g jsonb; v_gsig text; v_new jsonb; v_used integer[];
  v_r jsonb; v_old jsonb; v_j integer; v_ok boolean; v_aggiornati integer := 0; v_da_vedere integer := 0; v_eliminati integer := 0;
  v_motivo text; v_note text[]; v_doc jsonb; v_pcol text; v_tsig text; v_data date; v_party uuid; v_vinc text;
begin
  for l in
    select * from maestro_import_log
    where company_id = p_company_id and esito in ('importato', 'presente') and doc_id is not null
      and doc_tipo in ('preventivi', 'ordini_cliente', 'ordini_fornitore', 'ddt', 'fatture_cliente', 'note_credito',
                       'fatture_fornitore', 'note_credito_fornitore')
    order by tabella, numreg
  loop
    v_note := '{}';
    v_pcol := case when l.doc_tipo in ('ordini_fornitore', 'fatture_fornitore', 'note_credito_fornitore') then 'fornitore_id' else 'cliente_id' end;
    execute format('select to_jsonb(t) from public.%I t where company_id = $1 and id = $2 for update', l.doc_tipo)
      into v_doc using p_company_id, l.doc_id;
    continue when v_doc is null;

    -- Testata valida in Maestro (la più recente tra quelle non eliminate).
    select m.dati into h from maestro_records m
    where m.company_id = p_company_id and m.tabella = l.tabella and not m.deleted and m.dati->>'NUMREG' = l.numreg::text
    order by m.updated_at desc limit 1;

    -- ---- Eliminato in Maestro -----------------------------------------------
    if h is null then
      -- Solo documenti visti validi in un import precedente (testata nota):
      -- quelli già eliminati in Maestro prima di questa funzione non si toccano.
      continue when l.testata is null;
      continue when not exists (select 1 from maestro_records m where m.company_id = p_company_id and m.tabella = l.tabella
                                  and m.deleted and m.dati->>'NUMREG' = l.numreg::text);
      if exists (select 1 from maestro_import_log o where o.company_id = p_company_id and o.doc_id = l.doc_id
                   and (o.tabella, o.numreg) <> (l.tabella, l.numreg) and o.esito in ('importato', 'presente')) then
        -- Lo stesso documento del gestionale è abbinato anche a un'altra registrazione di Maestro: resta.
        update maestro_import_log set esito = 'ignorato', doc_id = null, contenuto = null, testata = null,
               motivo = 'eliminato in Maestro, sostituito da un''altra registrazione dello stesso documento', updated_at = now()
        where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
        continue;
      end if;
      v_vinc := maestro_documento_vincolato(p_company_id, l.doc_tipo, l.doc_id);
      if v_vinc is null then
        begin
          execute format('delete from public.%I where company_id = $1 and id = $2', l.doc_tipo) using p_company_id, l.doc_id;
          update maestro_import_log set esito = 'ignorato', doc_id = null, contenuto = null, testata = null,
                 motivo = 'eliminato in Maestro il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI')
                          || ': eliminato anche nel gestionale (' || coalesce(l.doc_num, '') || ')', updated_at = now()
          where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
          v_eliminati := v_eliminati + 1;
          continue;
        exception when others then
          v_vinc := sqlerrm;
        end;
      end if;
      v_motivo := 'eliminato in Maestro, ma non nel gestionale (' || v_vinc || '): da eliminare o tenere a mano';
      update maestro_import_log set motivo = v_motivo, updated_at = now()
      where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg and motivo is distinct from v_motivo;
      v_da_vedere := v_da_vedere + 1;
      continue;
    end if;

    -- ---- Testata: data e controparte ----------------------------------------
    v_tsig := maestro_testata(l.tabella, h);
    if l.testata is null then
      update maestro_import_log set testata = v_tsig, doc_data = (v_doc->>'data')::date, doc_party = (v_doc->>v_pcol)::uuid
      where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
    elsif l.testata <> v_tsig then
      v_data := coalesce(maestro_data(h->>'DATAFAT'), case when h->>'N_DATAFAT' ~ '^\d{4}-\d{2}-\d{2}$' then (h->>'N_DATAFAT')::date end);
      v_party := maestro_controparte(p_company_id, l.tabella, h);
      if (v_doc->>'data')::date = v_data and (v_doc->>v_pcol)::uuid is not distinct from v_party then
        update maestro_import_log set testata = v_tsig, doc_data = v_data, doc_party = v_party
        where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
      elsif (v_doc->>'data')::date is distinct from l.doc_data or (v_doc->>v_pcol)::uuid is distinct from l.doc_party then
        v_note := array_append(v_note, 'data o cliente/fornitore cambiati in Maestro, ma cambiati anche nel gestionale: da allineare a mano'::text);
      elsif v_data is null or v_party is null then
        v_note := array_append(v_note, 'data o cliente/fornitore cambiati in Maestro, ma non riconosciuti nel gestionale: da allineare a mano'::text);
      elsif extract(year from v_data) <> extract(year from (v_doc->>'data')::date) and coalesce(v_doc->>'num', '') ~ '^[A-Z]+/[0-9]{4}/' then
        v_note := array_append(v_note, 'data cambiata in Maestro su un altro anno (il numero cambierebbe): da allineare a mano'::text);
      else
        begin
          execute format('update public.%I set data = $3, %I = $4 where company_id = $1 and id = $2', l.doc_tipo, v_pcol)
            using p_company_id, l.doc_id, v_data, v_party;
          update maestro_import_log set testata = v_tsig, doc_data = v_data, doc_party = v_party,
                 motivo = 'data/cliente aggiornati da Maestro il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
                 updated_at = now()
          where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
          v_aggiornati := v_aggiornati + 1;
        exception when others then
          v_note := array_append(v_note, ('data o cliente/fornitore cambiati in Maestro, aggiornamento non riuscito: ' || sqlerrm)::text);
        end;
      end if;
    end if;

    -- ---- Righe (0048/0049) ----------------------------------------------------
    v_lines := case l.tabella when 'PREVENTI' then 'ARCART_P' when 'ORDINICL' then 'ARCART_L' when 'ORDINI' then 'ARCART_O'
                              when 'BOLLE' then 'ARCART_B' when 'VENDITE' then 'ARCART_V' when 'ACQUISTI' then 'ARCART_A' end;
    v_m := maestro_righe(p_company_id, v_lines, l.numreg);
    if l.tabella = 'VENDITE' and jsonb_array_length(v_m) = 0 then
      select coalesce(jsonb_agg(e.r order by b.n, e.i), '[]'::jsonb) into v_m
      from (select (m.dati->>'NUMREG')::integer n from maestro_records m
            where m.company_id = p_company_id and m.tabella = 'BOLLE' and not m.deleted
              and m.dati->>'NRIFPERBOL' = l.numreg::text) b,
           lateral jsonb_array_elements(maestro_righe(p_company_id, 'ARCART_B', b.n)) with ordinality e(r, i);
    end if;
    if jsonb_array_length(v_m) > 0 then
      v_sig := maestro_contenuto(v_m);
      if l.contenuto is null then
        update maestro_import_log set contenuto = v_sig
        where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
      elsif l.contenuto <> v_sig then
        execute format('select righe from public.%I where company_id = $1 and id = $2', l.doc_tipo) into v_g using p_company_id, l.doc_id;
        v_gsig := maestro_contenuto(v_g);
        if v_gsig = v_sig then
          update maestro_import_log set contenuto = v_sig
          where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
        elsif v_gsig <> l.contenuto then
          v_note := array_append(v_note, 'righe modificate in Maestro dopo l''import, ma cambiate anche nel gestionale: da allineare a mano'::text);
        else
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
          if exists (select 1 from jsonb_array_elements(v_g) with ordinality y(g, i)
                     where not (i::integer = any(v_used)) and coalesce(maestro_numero(g->>'qtyEv'), 0) > 0) then
            v_ok := false;
          end if;
          if not v_ok then
            v_note := array_append(v_note, 'righe modificate in Maestro dopo l''import, ma toglierebbero quantità già evase nel gestionale: da allineare a mano'::text);
          else
            begin
              execute format('update public.%I set righe = $3 where company_id = $1 and id = $2', l.doc_tipo)
                using p_company_id, l.doc_id, v_new;
              update maestro_import_log set contenuto = v_sig,
                     motivo = 'aggiornato da Maestro il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
                     updated_at = now()
              where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg;
              v_aggiornati := v_aggiornati + 1;
            exception when others then
              v_note := array_append(v_note, ('righe modificate in Maestro dopo l''import, aggiornamento non riuscito: ' || sqlerrm)::text);
            end;
          end if;
        end if;
      end if;
    end if;

    -- Da vedere a mano: lo si scrive una volta, senza riscriverlo a ogni giro.
    if array_length(v_note, 1) > 0 then
      v_motivo := array_to_string(v_note, '; ');
      update maestro_import_log set motivo = v_motivo, updated_at = now()
      where company_id = l.company_id and tabella = l.tabella and numreg = l.numreg and motivo is distinct from v_motivo;
      v_da_vedere := v_da_vedere + 1;
    end if;
  end loop;
  return jsonb_build_object('aggiornati', v_aggiornati, 'eliminati', v_eliminati, 'da_allineare', v_da_vedere);
end;
$$;
revoke all on function public.maestro_testata(text, jsonb) from public, anon, authenticated;
revoke all on function public.maestro_controparte(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.maestro_documento_vincolato(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.maestro_testata(text, jsonb) to service_role;
grant execute on function public.maestro_controparte(uuid, text, jsonb) to service_role;
grant execute on function public.maestro_documento_vincolato(uuid, text, uuid) to service_role;

-- Punto di partenza della testata per i documenti già importati (nessuna modifica).
select public.maestro_aggiorna_modificati(c) from (select distinct company_id c from public.maestro_import_log) x;
