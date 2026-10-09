-- Import da Maestro: eliminazione automatica dei documenti eliminati in
-- Maestro (vedi 0050, dove per ora venivano solo segnalati). Si elimina nel
-- gestionale solo se nulla ne dipende (maestro_documento_vincolato) e se
-- nessun'altra registrazione di Maestro è abbinata allo stesso documento;
-- altrimenti si continua a segnalare.

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

select public.maestro_aggiorna_modificati(c) from (select distinct company_id c from public.maestro_import_log) x;
