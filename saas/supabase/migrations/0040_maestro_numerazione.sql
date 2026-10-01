-- Import Maestro (0039), secondo passo: numerazione allineata a Maestro.
--
--  * Un documento con lo stesso numero è riconosciuto anche quando il
--    gestionale lo ha registrato con il suffisso -2, -3… (così registra i
--    numeri che in Maestro compaiono due volte), o con una controparte
--    diversa ma le stesse righe o lo stesso imponibile (anagrafiche doppie).
--  * Un numero che Maestro ha davvero doppio entra con il primo suffisso
--    libero, invece di finire tra i documenti da verificare.
--  * A fine import i contatori del gestionale (document_counters) ripartono
--    dopo l'ultimo numero presente: il prossimo DDT o fattura creato nel
--    gestionale non riusa un numero già arrivato da Maestro.

create or replace function public.maestro_numero_usato(p_company_id uuid, p_tabelle text[], p_num text)
returns boolean language plpgsql stable set search_path = public as $$
declare t text; v boolean;
begin
  foreach t in array p_tabelle loop
    continue when t is null;
    execute format('select exists (select 1 from public.%I where company_id = $1 and num = $2)', t) into v using p_company_id, p_num;
    if v then return true; end if;
  end loop;
  return false;
end;
$$;

create or replace function public.maestro_import(p_company_id uuid, p_dal date default date '2026-01-01')
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_map jsonb := '{}';
  v_tab text; v_kind text; v_lines text; v_prefix text; v_main text; v_alt text; v_pcol text;
  h record; d jsonb;
  v_data date; v_num text; v_code text; v_party uuid; v_party_name text; v_righe jsonb;
  v_found record; v_id uuid; v_esito text; v_motivo text; v_doc_tipo text; v_doc_num text;
  v_ddt record; v_window integer; v_neg boolean; v_target text;
  v_importati jsonb := '{}'; v_nuove_anag jsonb := '[]';
  v_n_presenti integer := 0; v_run uuid; v_creata boolean; v_ppiva text;
  v_c record; v_t text; v_score integer; v_best integer; v_i integer;
begin
  if p_company_id is null then raise exception 'azienda mancante'; end if;
  -- Un solo import alla volta per azienda: l'agente può inviare più file insieme.
  perform pg_advisory_xact_lock(hashtext('maestro_import:' || p_company_id::text));

  -- Codici cliente/fornitore di Maestro già associati a una controparte del
  -- gestionale, ricavati dai documenti con stesso numero e stessa data.
  -- Vince la controparte più frequente; a pari merito nessuna (si passa a P.IVA e nome).
  select coalesce(jsonb_object_agg(k, party), '{}') into v_map from (
    select k, (array_agg(party order by n desc))[1] party
    from (select k, party, sum(n) n from (
      select 'C:' || btrim(m.dati->>'NUMCLI') k, x.cliente_id party, count(*) n
      from maestro_records m
      join ddt x on x.company_id = m.company_id and x.data = maestro_data(m.dati->>'DATAFAT')
        and x.num = 'DDT/' || extract(year from maestro_data(m.dati->>'DATAFAT'))::int || '/' || lpad(m.dati->>'NUMFAT', 4, '0')
      where m.company_id = p_company_id and m.tabella = 'BOLLE' and not m.deleted and btrim(coalesce(m.dati->>'NUMCLI', '')) <> ''
      group by 1, 2
      union all
      select 'C:' || btrim(m.dati->>'NUMCLI'), x.cliente_id, count(*)
      from maestro_records m
      join fatture_cliente x on x.company_id = m.company_id and x.data = maestro_data(m.dati->>'DATAFAT')
        and x.num = 'FT/' || extract(year from maestro_data(m.dati->>'DATAFAT'))::int || '/' || lpad(m.dati->>'NUMFAT', 4, '0')
      where m.company_id = p_company_id and m.tabella = 'VENDITE' and not m.deleted and btrim(coalesce(m.dati->>'NUMCLI', '')) <> ''
      group by 1, 2
      union all
      select 'F:' || btrim(m.dati->>'NUMFOR'), x.fornitore_id, count(*)
      from maestro_records m
      join fatture_fornitore x on x.company_id = m.company_id and x.data = maestro_data(m.dati->>'DATAFAT')
        and x.num = btrim(m.dati->>'NUMERO')
      where m.company_id = p_company_id and m.tabella = 'ACQUISTI' and not m.deleted and btrim(coalesce(m.dati->>'NUMFOR', '')) <> ''
      group by 1, 2
      union all
      select 'F:' || btrim(m.dati->>'NUMFOR'), x.fornitore_id, count(*)
      from maestro_records m
      join ordini_fornitore x on x.company_id = m.company_id and x.data = maestro_data(m.dati->>'DATAFAT')
        and x.num = 'OF/' || extract(year from maestro_data(m.dati->>'DATAFAT'))::int || '/' || lpad(m.dati->>'NUMFAT', 4, '0')
      where m.company_id = p_company_id and m.tabella = 'ORDINI' and not m.deleted and btrim(coalesce(m.dati->>'NUMFOR', '')) <> ''
      group by 1, 2
    ) z group by k, party) t
    group by k
    having count(*) = 1 or (array_agg(n order by n desc))[1] > (array_agg(n order by n desc))[2]
  ) y;

  -- Ordine: prima ciò che altri documenti richiamano (DDT prima delle fatture).
  foreach v_tab in array array['PREVENTI', 'ORDINICL', 'ORDINI', 'BOLLE', 'VENDITE', 'ACQUISTI'] loop
    v_kind := case when v_tab in ('ORDINI', 'ACQUISTI') then 'F' else 'C' end;
    v_pcol := case v_kind when 'C' then 'cliente_id' else 'fornitore_id' end;
    v_lines := case v_tab when 'PREVENTI' then 'ARCART_P' when 'ORDINICL' then 'ARCART_L' when 'ORDINI' then 'ARCART_O'
                          when 'BOLLE' then 'ARCART_B' when 'VENDITE' then 'ARCART_V' else 'ARCART_A' end;
    v_prefix := case v_tab when 'PREVENTI' then 'PREV' when 'ORDINICL' then 'OC' when 'ORDINI' then 'OF'
                           when 'BOLLE' then 'DDT' when 'VENDITE' then 'FT' else null end;
    v_main := case v_tab when 'PREVENTI' then 'preventivi' when 'ORDINICL' then 'ordini_cliente' when 'ORDINI' then 'ordini_fornitore'
                         when 'BOLLE' then 'ddt' when 'VENDITE' then 'fatture_cliente' else 'fatture_fornitore' end;
    v_alt := case v_tab when 'VENDITE' then 'note_credito' when 'ACQUISTI' then 'note_credito_fornitore' end;
    -- Gli ordini clienti importati in passato hanno spesso una data diversa da
    -- Maestro: per loro le righe uguali bastano, nello stesso anno.
    v_window := case v_tab when 'ORDINICL' then 366 else 10 end;

    for h in
      select (m.dati->>'NUMREG')::integer numreg, m.dati
      from maestro_records m
      where m.company_id = p_company_id and m.tabella = v_tab and not m.deleted
        and m.dati->>'NUMREG' ~ '^[0-9]+$'
        and coalesce(maestro_data(m.dati->>'DATAFAT'), case when m.dati->>'N_DATAFAT' ~ '^\d{4}-\d{2}-\d{2}$' then (m.dati->>'N_DATAFAT')::date end) >= p_dal
        and not exists (select 1 from maestro_import_log l where l.company_id = p_company_id and l.tabella = v_tab
                          and l.numreg = (m.dati->>'NUMREG')::integer and l.esito in ('importato', 'presente', 'ignorato'))
      order by m.dati->>'N_DATAFAT', (m.dati->>'NUMREG')::integer
    loop
      d := h.dati;
      v_id := null; v_esito := null; v_motivo := null; v_doc_num := null; v_party := null; v_code := null; v_creata := false;
      v_data := coalesce(maestro_data(d->>'DATAFAT'), case when d->>'N_DATAFAT' ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'N_DATAFAT')::date end);
      v_party_name := btrim(regexp_replace(coalesce(d->>case v_kind when 'C' then 'CLIENTE' else 'FORNITORE' end, ''), '\s+', ' ', 'g'));
      v_neg := coalesce(maestro_numero(d->>'TOTALE'), 0) < 0;
      v_target := case when (v_tab = 'VENDITE' and d->>'TIPO' = 'N') or (v_tab = 'ACQUISTI' and d->>'TIPO' = 'N') then v_alt else v_main end;
      v_doc_tipo := v_target;
      v_num := case when v_prefix is null then nullif(btrim(coalesce(nullif(btrim(d->>'NUMERO'), ''), d->>'CNUMERO')), '')
                    when coalesce(d->>'NUMFAT', '') ~ '^[0-9]+$' then v_prefix || '/' || extract(year from v_data)::int || '/' || lpad(d->>'NUMFAT', 4, '0') end;

      begin
        if v_num is null then
          v_esito := 'conflitto'; v_motivo := 'numero del documento mancante in Maestro';
        elsif v_tab = 'BOLLE' and v_neg then
          v_esito := 'ignorato'; v_motivo := 'DDT con totale negativo (reso/storno): non si importa come DDT';
        else
          -- Controparte.
          v_code := nullif(btrim(d->>case v_kind when 'C' then 'NUMCLI' else 'NUMFOR' end), '');
          if v_code is not null and v_map ? (v_kind || ':' || v_code) then
            v_party := (v_map->>(v_kind || ':' || v_code))::uuid;
          end if;
          if v_party is null and maestro_piva(d->>'PIVACF') is not null then
            execute format('select id from public.%I where company_id = $1 and (maestro_piva(piva) = $2 or maestro_piva(cf) = $2) order by created_at limit 1',
                           case v_kind when 'C' then 'clienti' else 'fornitori' end)
              into v_party using p_company_id, maestro_piva(d->>'PIVACF');
          end if;
          if v_party is null and maestro_norm(d->>'CODFISC') is not null then
            execute format('select id from public.%I where company_id = $1 and (maestro_norm(cf) = $2 or maestro_piva(piva) = $2) order by created_at limit 1',
                           case v_kind when 'C' then 'clienti' else 'fornitori' end)
              into v_party using p_company_id, maestro_norm(d->>'CODFISC');
          end if;
          if v_party is null and maestro_norm(v_party_name) is not null then
            execute format('select id from public.%I where company_id = $1 and maestro_norm(nome) = $2 order by created_at limit 1',
                           case v_kind when 'C' then 'clienti' else 'fornitori' end)
              into v_party using p_company_id, maestro_norm(v_party_name);
          end if;
          if v_party is null and (v_party_name <> '' or v_code is not null) and not (v_tab = 'PREVENTI' and v_party_name = '') then
            v_party := maestro_crea_controparte(p_company_id, v_kind, v_code, d);
            v_creata := true;
            v_nuove_anag := v_nuove_anag || jsonb_build_object('tipo', case v_kind when 'C' then 'cliente' else 'fornitore' end,
              'nome', (select nome from (select nome, id from clienti union all select nome, id from fornitori) a where a.id = v_party));
          end if;
          if v_code is not null and v_party is not null then
            v_map := v_map || jsonb_build_object(v_kind || ':' || v_code, v_party);
          end if;

          if v_party is null and v_tab <> 'PREVENTI' then
            v_esito := 'conflitto'; v_motivo := 'controparte non riconosciuta';
          else
            v_righe := maestro_righe(p_company_id, v_lines, h.numreg);
            if v_tab = 'VENDITE' and jsonb_array_length(v_righe) = 0 then
              -- Fattura differita: Maestro tiene le righe sui DDT fatturati.
              select coalesce(jsonb_agg(e.r order by b.n, e.i), '[]'::jsonb) into v_righe
              from (select (m.dati->>'NUMREG')::integer n from maestro_records m
                    where m.company_id = p_company_id and m.tabella = 'BOLLE' and not m.deleted
                      and m.dati->>'NRIFPERBOL' = h.numreg::text) b,
                   lateral jsonb_array_elements(maestro_righe(p_company_id, 'ARCART_B', b.n)) with ordinality e(r, i);
            end if;
            -- Stesso numero già presente? Si guardano anche i suffissi -2, -3…
            -- con cui il gestionale registra i numeri che Maestro ha doppi, e si
            -- saltano i documenti già abbinati a un altro documento di Maestro.
            -- Vale come presente: stessa controparte (3), oppure stessa data e
            -- P.IVA compatibile (2: anagrafiche doppie), oppure stesse righe o
            -- stesso imponibile (1).
            v_found := null; v_best := 0;
            foreach v_t in array case when v_alt is null then array[v_main] else array[v_main, v_alt] end loop
              for v_c in execute format(
                  'select x.id, x.num, x.data, x.%1$I party, x.righe from public.%2$I x
                    where x.company_id = $1 and (x.num = $2 or x.num like $2 || ''-%%'') %3$s
                      and not exists (select 1 from public.maestro_import_log l where l.company_id = $1 and l.doc_id = x.id
                                        and not (l.tabella = $4 and l.numreg = $5))
                    order by x.num',
                  v_pcol, v_t, case when v_kind = 'F' and v_prefix is null then 'and x.fornitore_id = $3' else '' end)
                using p_company_id, v_num, v_party, v_tab, h.numreg
              loop
                v_ppiva := (select maestro_piva(piva) from clienti where id = v_c.party
                            union all select maestro_piva(piva) from fornitori where id = v_c.party limit 1);
                v_score := case
                  when v_c.party is not distinct from v_party then 3
                  when v_c.data = v_data and coalesce(v_ppiva, maestro_piva(d->>'PIVACF'), '') = coalesce(maestro_piva(d->>'PIVACF'), '') then 2
                  when jsonb_array_length(v_righe) > 0 and (maestro_firma(v_c.righe) = maestro_firma(v_righe)
                       or (maestro_imponibile(v_righe) <> 0 and abs(maestro_imponibile(v_c.righe) - maestro_imponibile(v_righe)) < 0.02)) then 1
                  else 0 end;
                if v_score > v_best then v_best := v_score; v_found := v_c; end if;
              end loop;
            end loop;
            if v_best > 0 then
              v_esito := 'presente'; v_id := v_found.id; v_doc_num := v_found.num;
              if v_best = 1 then v_motivo := 'nel gestionale la controparte è diversa da Maestro'; end if;
            else
              if jsonb_array_length(v_righe) = 0 and coalesce(maestro_numero(d->>'TOTALE'), 0) = 0 then
                v_esito := 'ignorato'; v_motivo := 'documento vuoto in Maestro (nessuna riga, totale zero)';
              elsif jsonb_array_length(v_righe) = 0 then
                v_esito := 'in_attesa'; v_motivo := 'righe del documento non ancora ricevute da Maestro';
              else
                -- Stesso contenuto con un altro numero?
                execute format('select id, num from public.%I x where company_id = $1 and %I is not distinct from $2 and abs(x.data - $3) <= $4
                                  and (maestro_firma(x.righe) = $5
                                       or (abs(x.data - $3) <= 3 and $6 <> 0 and abs(maestro_imponibile(x.righe) - $6) < 0.02))
                                  and not exists (select 1 from public.maestro_import_log l where l.company_id = $1 and l.doc_id = x.id)
                                order by abs(x.data - $3) limit 1', v_target, v_pcol)
                  into v_found using p_company_id, v_party, v_data, v_window, maestro_firma(v_righe), maestro_imponibile(v_righe);
                if v_found.id is not null then
                  v_id := v_found.id; v_doc_num := v_found.num;
                  if v_tab in ('BOLLE', 'VENDITE', 'ACQUISTI') then
                    v_esito := 'conflitto'; v_motivo := 'già presente nel gestionale con il numero ' || v_found.num || ': numerazione diversa da Maestro';
                  else
                    v_esito := 'presente';
                  end if;
                else
                  if maestro_numero_usato(p_company_id, array[v_main, v_alt], v_num) then
                    if v_prefix is not null and v_tab <> 'PREVENTI' and exists (
                        select 1 from maestro_records m2
                        where m2.company_id = p_company_id and m2.tabella = v_tab and not m2.deleted
                          and m2.dati->>'NUMFAT' = d->>'NUMFAT' and m2.dati->>'NUMREG' <> h.numreg::text
                          and right(coalesce(m2.dati->>'DATAFAT', ''), 4) = extract(year from v_data)::text) then
                      -- Numero doppio anche in Maestro: suffisso -2, -3… come fa il gestionale.
                      for v_i in 2..9 loop
                        if not maestro_numero_usato(p_company_id, array[v_main, v_alt], v_num || '-' || v_i) then
                          v_num := v_num || '-' || v_i; exit;
                        end if;
                      end loop;
                    elsif v_tab = 'PREVENTI' then
                      v_num := v_num || '-M';
                    end if;
                  end if;
                  if maestro_numero_usato(p_company_id, array[v_main, v_alt], v_num) then
                    v_esito := 'conflitto'; v_motivo := 'il numero ' || v_num || ' nel gestionale è già usato da un altro documento';
                  elsif v_num ~ '/0+(-M|-[0-9])?$' then
                    v_esito := 'ignorato'; v_motivo := 'documento senza numero in Maestro (n. 0)';
                  elsif v_neg and v_target in ('fatture_cliente', 'fatture_fornitore') then
                    v_esito := 'conflitto'; v_motivo := 'fattura con totale negativo: va registrata come nota di credito';
                  else
                    v_id := maestro_crea_documento(p_company_id, v_target, v_tab, h.numreg, v_num, v_data, v_party, v_righe, d);
                    v_esito := 'importato'; v_doc_num := v_num;
                    v_importati := jsonb_set(v_importati, array[v_target], to_jsonb(coalesce((v_importati->>v_target)::integer, 0) + 1));
                  end if;
                end if;
              end if;
            end if;
          end if;
        end if;
      exception when others then
        -- Il sottoblocco annulla anche l'eventuale anagrafica appena creata.
        if v_code is not null then v_map := v_map - (v_kind || ':' || v_code); end if;
        if v_creata then v_nuove_anag := v_nuove_anag - (jsonb_array_length(v_nuove_anag) - 1); end if;
        v_esito := 'conflitto'; v_motivo := 'errore durante l''import: ' || sqlerrm; v_id := null; v_doc_num := null;
      end;

      if v_esito = 'presente' then v_n_presenti := v_n_presenti + 1; end if;
      insert into maestro_import_log as l (company_id, tabella, numreg, esito, doc_tipo, doc_id, doc_num, data, controparte, motivo, updated_at)
      values (p_company_id, v_tab, h.numreg, v_esito, v_doc_tipo, v_id, coalesce(v_doc_num, v_num), v_data, v_party_name, v_motivo, now())
      on conflict (company_id, tabella, numreg) do update
        set esito = excluded.esito, doc_tipo = excluded.doc_tipo, doc_id = excluded.doc_id, doc_num = excluded.doc_num,
            data = excluded.data, controparte = excluded.controparte, motivo = excluded.motivo,
            updated_at = case when (l.esito, l.motivo) is distinct from (excluded.esito, excluded.motivo) then now() else l.updated_at end;
    end loop;
  end loop;

  -- I contatori del gestionale ripartono dopo l'ultimo numero presente: il
  -- prossimo DDT, fattura, ordine o preventivo segue quelli arrivati da Maestro.
  insert into document_counters (company_id, doc_type, anno, next_value)
  select p_company_id, t, y, max(n) + 1 from (
    select split_part(num, '/', 1) t, split_part(num, '/', 2)::integer y,
           substring(split_part(num, '/', 3) from '^[0-9]+')::integer n
    from (select num from ddt where company_id = p_company_id
          union all select num from fatture_cliente where company_id = p_company_id
          union all select num from note_credito where company_id = p_company_id
          union all select num from ordini_cliente where company_id = p_company_id
          union all select num from ordini_fornitore where company_id = p_company_id
          union all select num from preventivi where company_id = p_company_id) a
    where num ~ '^(DDT|FT|OC|OF|PREV)/[0-9]{4}/[0-9]+'
  ) z
  where y >= extract(year from p_dal)
  group by t, y
  on conflict (company_id, doc_type, anno) do update
    set next_value = greatest(document_counters.next_value, excluded.next_value);

  insert into maestro_sync_runs (company_id, tabella, stato, report, finito_at)
  values (p_company_id, 'IMPORT', 'ok', jsonb_build_object(
      'importati', v_importati,
      'nuove_anagrafiche', v_nuove_anag,
      'gia_presenti', v_n_presenti,
      'da_verificare', (select count(*) from maestro_import_log where company_id = p_company_id and esito = 'conflitto'),
      'in_attesa', (select count(*) from maestro_import_log where company_id = p_company_id and esito = 'in_attesa')),
    now())
  returning id into v_run;
  return (select report || jsonb_build_object('run_id', id) from maestro_sync_runs where id = v_run);
end;
$$;

revoke all on function public.maestro_numero_usato(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.maestro_numero_usato(uuid, text[], text) to service_role;
