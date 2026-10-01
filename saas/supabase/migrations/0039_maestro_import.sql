-- Import automatico dei documenti di Maestro Gold nel gestionale.
--
-- maestro_records contiene la copia grezza dei file di Maestro (vedi 0038).
-- maestro_import() ne ricava i documenti che nel gestionale mancano: DDT,
-- fatture e note di credito, ordini clienti e fornitori, preventivi, fatture
-- e note di credito dei fornitori. La chiama la Edge Function maestro-sync
-- dopo ogni invio dell'agente; si può lanciare anche a mano (service role).
--
-- Regole:
--  * solo documenti dalla data p_dal (default 1/1/2026);
--  * un documento c'è già se esiste con lo stesso numero e la stessa
--    controparte, oppure con le stesse righe (codici e quantità), la stessa
--    controparte e una data vicina: in quel caso non si crea niente;
--  * un numero già usato da un altro documento non si sovrascrive mai: il
--    caso finisce tra i "da verificare" (i preventivi, che non sono fiscali,
--    entrano con il suffisso -M);
--  * clienti e fornitori si riconoscono dal codice Maestro già visto sui
--    documenti comuni, poi da partita IVA, codice fiscale e nome; se non ci
--    sono si creano dall'anagrafica di Maestro;
--  * ogni documento di Maestro ha una riga in maestro_import_log con l'esito:
--    quelli importati o già presenti non si riesaminano, gli altri sì a ogni
--    giro (per esempio quando arrivano le righe o si corregge il gestionale).

create table if not exists public.maestro_import_log (
  company_id uuid not null references public.companies(id) on delete cascade,
  tabella text not null,
  numreg integer not null,
  esito text not null check (esito in ('importato','presente','conflitto','in_attesa','ignorato')),
  doc_tipo text,
  doc_id uuid,
  doc_num text,
  data date,
  controparte text,
  motivo text,
  updated_at timestamptz not null default now(),
  primary key (company_id, tabella, numreg)
);
create index if not exists maestro_import_log_doc on public.maestro_import_log(company_id, doc_id);
alter table public.maestro_import_log enable row level security;
drop policy if exists "membri leggono import maestro" on public.maestro_import_log;
create policy "membri leggono import maestro" on public.maestro_import_log
  for select using (public.is_member(company_id));
revoke insert, update, delete on public.maestro_import_log from anon, authenticated;

-- Le righe di Maestro si cercano per NUMREG del documento.
create index if not exists maestro_records_numreg
  on public.maestro_records(company_id, tabella, ((dati->>'NUMREG')));

create or replace function public.maestro_data(t text) returns date
language sql stable set search_path = public as $$
  select case when t ~ '^\d{2}/\d{2}/\d{4}$' then to_date(t, 'DD/MM/YYYY') end
$$;

create or replace function public.maestro_norm(t text) returns text
language sql immutable set search_path = public as $$
  select nullif(regexp_replace(upper(coalesce(t, '')), '[^0-9A-Z]', '', 'g'), '')
$$;

create or replace function public.maestro_piva(t text) returns text
language sql immutable set search_path = public as $$
  select case when n ~ '^IT[0-9]{11}$' then substr(n, 3) else n end
  from (select public.maestro_norm(t) n) x
$$;

create or replace function public.maestro_numtxt(v numeric) returns text
language sql immutable set search_path = public as $$
  select case when v is null then '' when v = trunc(v) then trunc(v)::bigint::text
              else regexp_replace(v::text, '0+$', '') end
$$;

create or replace function public.maestro_numero(t text) returns numeric
language sql immutable set search_path = public as $$
  select case when btrim(coalesce(t, '')) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(t)::numeric end
$$;

-- Righe nel formato del gestionale: cod è il codice del produttore (CODEDUE),
-- gli sconti in cascata diventano "55+15", lotto e scadenza vuoti se assenti.
create or replace function public.maestro_righe(p_company_id uuid, p_tabella text, p_numreg integer)
returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'cod', coalesce(nullif(btrim(d->>'CODEDUE'), ''), nullif(btrim(d->>'CODICE'), ''), ''),
      'descr', coalesce(btrim(d->>'DESCRIZION'), ''),
      'qty', coalesce(maestro_numero(d->>'QUANTITA'), 0),
      'prezzo', coalesce(maestro_numero(d->>'PREZZO'), 0),
      'sconto', coalesce((select string_agg(maestro_numtxt(s), '+' order by o)
                 from unnest(array[maestro_numero(d->>'SCONTO'), maestro_numero(d->>'SCOAC2'), maestro_numero(d->>'SCOAC3')])
                      with ordinality u(s, o) where s <> 0), ''),
      'iva', coalesce(maestro_numero(d->>'IVA'), 0),
      'lotto', coalesce(btrim(d->>'NLOTTO'), ''),
      'scad', case when d->>'DLOTTO' ~ '^\d{4}-\d{2}-\d{2}$' and d->>'DLOTTO' > '1900-01-01' then d->>'DLOTTO' else '' end
    ) order by r.chiave::integer), '[]'::jsonb)
  from maestro_records r, lateral (select r.dati d) x
  where r.company_id = p_company_id and r.tabella = p_tabella and not r.deleted
    and r.dati->>'NUMREG' = p_numreg::text
$$;

-- Impronta del contenuto: codici e quantità, in ordine. Serve a riconoscere
-- lo stesso documento registrato con un numero diverso.
create or replace function public.maestro_firma(p_righe jsonb) returns text
language sql immutable set search_path = public as $$
  select coalesce(string_agg(k, '|' order by k), '')
  from (select coalesce(maestro_norm(r->>'cod'), '') || 'x' || maestro_numtxt(coalesce(maestro_numero(r->>'qty'), 0)) k
        from jsonb_array_elements(case when jsonb_typeof(p_righe) = 'array' then p_righe else '[]'::jsonb end) r) x
$$;

-- Imponibile delle righe (sconti in cascata "55+15"): riconosce lo stesso
-- documento anche quando è stato registrato con quantità e prezzi diversi.
create or replace function public.maestro_imponibile(p_righe jsonb) returns numeric
language sql immutable set search_path = public as $$
  select coalesce(round(sum(coalesce(maestro_numero(r->>'qty'), 0) * coalesce(maestro_numero(r->>'prezzo'), 0)
           * coalesce((select exp(sum(ln(greatest(1 - maestro_numero(s) / 100, 0.000001))))
                       from unnest(string_to_array(coalesce(r->>'sconto', ''), '+')) s
                       where maestro_numero(s) is not null and maestro_numero(s) <> 0), 1)), 2), 0)
  from jsonb_array_elements(case when jsonb_typeof(p_righe) = 'array' then p_righe else '[]'::jsonb end) r
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
            -- Stesso numero già presente?
            execute format('select id, num, data, %I party from public.%I where company_id = $1 and num = $2 %s order by (%I is not distinct from $3) desc limit 1',
                           v_pcol, v_target, case when v_kind = 'F' and v_prefix is null then 'and fornitore_id = $3' else '' end, v_pcol)
              into v_found using p_company_id, v_num, v_party;
            if v_found.id is null and v_alt is not null then
              -- Fatture e note di credito di Maestro condividono la numerazione.
              execute format('select id, num, data, %I party from public.%I where company_id = $1 and num = $2 %s order by (%I is not distinct from $3) desc limit 1',
                             v_pcol, case when v_target = v_main then v_alt else v_main end,
                             case when v_kind = 'F' then 'and fornitore_id = $3' else '' end, v_pcol)
                into v_found using p_company_id, v_num, v_party;
            end if;
            -- Stesso numero, stessa data e controparte compatibile (stessa P.IVA o
            -- senza P.IVA: anagrafiche doppie nel gestionale) vale come presente.
            if v_found.id is not null and v_found.party is distinct from v_party and v_found.data = v_data then
              v_ppiva := (select maestro_piva(piva) from clienti where id = v_found.party
                          union all select maestro_piva(piva) from fornitori where id = v_found.party limit 1);
              if coalesce(v_ppiva, maestro_piva(d->>'PIVACF'), '') = coalesce(maestro_piva(d->>'PIVACF'), '') then
                v_party := v_found.party;
              end if;
            end if;
            if v_found.id is not null and v_found.party is not distinct from v_party then
              v_esito := 'presente'; v_id := v_found.id; v_doc_num := v_found.num;
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
                  execute format('select num from public.%I where company_id = $1 and num = $2', v_target) into v_doc_num using p_company_id, v_num;
                  if v_doc_num is not null and v_tab = 'PREVENTI' then
                    v_num := v_num || '-M';
                    execute format('select num from public.%I where company_id = $1 and num = $2', v_target) into v_doc_num using p_company_id, v_num;
                  end if;
                  if v_doc_num is not null or exists (select 1 from fatture_cliente where v_tab = 'VENDITE' and company_id = p_company_id and num = v_num)
                     or exists (select 1 from note_credito where v_tab = 'VENDITE' and company_id = p_company_id and num = v_num) then
                    v_esito := 'conflitto'; v_motivo := 'il numero ' || v_num || ' nel gestionale è già usato da un altro documento';
                    v_doc_num := null;
                  elsif v_num ~ '/0+(-M)?$' then
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

-- Nuovo cliente o fornitore dall'anagrafica di Maestro (CLIENTI/FORNITOR), o
-- in mancanza dai dati scritti sul documento.
create or replace function public.maestro_crea_controparte(p_company_id uuid, p_kind text, p_code text, p_doc jsonb)
returns uuid language plpgsql set search_path = public as $$
declare a jsonb; v_id uuid; v_nome text;
begin
  select r.dati into a from maestro_records r
  where r.company_id = p_company_id and r.tabella = case p_kind when 'C' then 'CLIENTI' else 'FORNITOR' end
    and not r.deleted and p_code is not null and btrim(r.dati->>'CODICE') = p_code
  limit 1;
  a := coalesce(a, jsonb_build_object(
    'NOME', p_doc->>case p_kind when 'C' then 'CLIENTE' else 'FORNITORE' end,
    'CLIENT1', case p_kind when 'C' then p_doc->>'CLIENT1' end,
    'PIVACF', p_doc->>'PIVACF', 'CODFISC', p_doc->>'CODFISC',
    'ADDRESS', coalesce(nullif(p_doc->>'ADDRESS', ''), p_doc->>'INDIRIZZO'),
    'CAP', p_doc->>'CAP', 'CITTA', p_doc->>'CITTA', 'PROV', p_doc->>'PROV',
    'TELEFONO', p_doc->>'TELEFONO', 'PAGAMENTO', p_doc->>'PAGAMENTO'));
  v_nome := btrim(regexp_replace(coalesce(a->>'NOME', '') || ' ' || coalesce(case when p_kind = 'C' then a->>'CLIENT1' end, ''), '\s+', ' ', 'g'));
  if v_nome = '' then v_nome := 'Da Maestro ' || coalesce(p_code, ''); end if;
  if p_kind = 'C' then
    insert into clienti (company_id, nome, piva, cf, sdi, pec, via, cap, citta, prov, pag, iban, tel, email, note)
    values (p_company_id, v_nome, nullif(maestro_piva(a->>'PIVACF'), ''), nullif(btrim(a->>'CODFISC'), ''),
            nullif(btrim(a->>'CODICEFA'), ''), nullif(btrim(a->>'PEC'), ''), nullif(btrim(a->>'ADDRESS'), ''),
            nullif(btrim(a->>'CAP'), ''), nullif(btrim(a->>'CITTA'), ''), nullif(btrim(a->>'PROV'), ''),
            nullif(btrim(a->>'PAGAMENTO'), ''), nullif(btrim(a->>'IBAN'), ''), nullif(btrim(a->>'TELEFONO'), ''),
            nullif(btrim(a->>'EMAIL'), ''), 'Creato automaticamente dall''import di Maestro')
    returning id into v_id;
  else
    insert into fornitori (company_id, nome, piva, cf, via, cap, citta, prov, pag, iban, tel, email, note)
    values (p_company_id, v_nome, nullif(maestro_piva(a->>'PIVACF'), ''), nullif(btrim(a->>'CODFISC'), ''),
            nullif(btrim(a->>'ADDRESS'), ''), nullif(btrim(a->>'CAP'), ''), nullif(btrim(a->>'CITTA'), ''),
            nullif(btrim(a->>'PROV'), ''), nullif(btrim(a->>'PAGAMENTO'), ''), nullif(btrim(a->>'IBAN'), ''),
            nullif(btrim(a->>'TELEFONO'), ''), nullif(btrim(a->>'EMAIL'), ''), 'Creato automaticamente dall''import di Maestro')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.maestro_crea_documento(
  p_company_id uuid, p_target text, p_tab text, p_numreg integer, p_num text, p_data date,
  p_party uuid, p_righe jsonb, d jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid; v_note text := coalesce(btrim(d->>'ANNOTAZ'), '');
  v_paid boolean := coalesce((d->>'PAGATO')::boolean, false);
  v_paid_date date; v_pagamenti jsonb := '[]'; v_ddt record; v_righe jsonb := p_righe;
begin
  if v_paid and p_target in ('fatture_cliente', 'fatture_fornitore') then
    -- Maestro registra solo "pagato": come data si usa la scadenza, mai nel futuro.
    v_paid_date := least(coalesce(case when d->>'DRATA1' ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'DRATA1')::date end, p_data), current_date);
    v_pagamenti := jsonb_build_array(jsonb_build_object('data', v_paid_date, 'importo', coalesce(maestro_numero(d->>'TOTALE'), 0)));
  else
    v_paid := false;
  end if;

  if p_target = 'ddt' then
    insert into ddt (company_id, num, data, cliente_id, righe, extra)
    values (p_company_id, p_num, p_data, p_party, p_righe,
            jsonb_strip_nulls(jsonb_build_object('note', v_note, 'colli', nullif(maestro_numero(d->>'COLLI'), 0))))
    returning id into v_id;
  elsif p_target = 'fatture_cliente' then
    -- DDT fatturato: in Maestro il DDT punta alla fattura con NRIFPERBOL.
    select x.id, x.oc_id, x.righe into v_ddt
    from maestro_records b
    join maestro_import_log l on l.company_id = b.company_id and l.tabella = 'BOLLE' and l.numreg = (b.dati->>'NUMREG')::integer
    join ddt x on x.id = l.doc_id
    where b.company_id = p_company_id and b.tabella = 'BOLLE' and not b.deleted and b.dati->>'NRIFPERBOL' = p_numreg::text
      and not exists (select 1 from fatture_cliente f where f.company_id = p_company_id and f.ddt_id = x.id)
      and (select count(*) from maestro_records b2 where b2.company_id = p_company_id and b2.tabella = 'BOLLE'
             and not b2.deleted and b2.dati->>'NRIFPERBOL' = p_numreg::text) = 1;
    if v_ddt.id is not null and jsonb_array_length(v_ddt.righe) = jsonb_array_length(p_righe) then
      select jsonb_agg(r || jsonb_build_object('source_ddt_index', i - 1) order by i) into v_righe
      from jsonb_array_elements(p_righe) with ordinality e(r, i);
    end if;
    insert into fatture_cliente (company_id, num, data, cliente_id, ddt_id, oc_id, righe, paid, paid_date, pagamenti, extra)
    values (p_company_id, p_num, p_data, p_party, v_ddt.id, v_ddt.oc_id, v_righe, v_paid, v_paid_date, v_pagamenti,
            jsonb_build_object('note', v_note))
    returning id into v_id;
    if v_ddt.id is not null then
      update ddt set extra = extra || jsonb_build_object('ftId', p_num)
      where id = v_ddt.id and coalesce(extra->>'ftId', '') = '';
    end if;
  elsif p_target = 'note_credito' then
    insert into note_credito (company_id, num, data, cliente_id, righe, extra)
    values (p_company_id, p_num, p_data, p_party, p_righe, jsonb_build_object('note', v_note, 'ftId', null, 'ftIds', '[]'::jsonb))
    returning id into v_id;
  elsif p_target = 'ordini_cliente' then
    insert into ordini_cliente (company_id, num, data, cliente_id, righe, extra)
    values (p_company_id, p_num, p_data, p_party, p_righe, jsonb_build_object('note', v_note))
    returning id into v_id;
  elsif p_target = 'preventivi' then
    insert into preventivi (company_id, num, data, cliente_id, righe, note, extra)
    values (p_company_id, p_num, p_data, p_party, p_righe, v_note, '{}')
    returning id into v_id;
  elsif p_target = 'ordini_fornitore' then
    insert into ordini_fornitore (company_id, num, data, fornitore_id, righe, extra)
    values (p_company_id, p_num, p_data, p_party, p_righe, '{}')
    returning id into v_id;
  elsif p_target = 'fatture_fornitore' then
    insert into fatture_fornitore (company_id, num, data, fornitore_id, righe, paid, paid_date, pagamenti, extra)
    values (p_company_id, p_num, p_data, p_party, p_righe, v_paid, v_paid_date, v_pagamenti, '{}')
    returning id into v_id;
  elsif p_target = 'note_credito_fornitore' then
    insert into note_credito_fornitore (company_id, num, data, fornitore_id, righe, extra)
    values (p_company_id, p_num, p_data, p_party, p_righe, jsonb_build_object('note', v_note))
    returning id into v_id;
  else
    raise exception 'tipo documento non gestito: %', p_target;
  end if;
  return v_id;
end;
$$;

-- Solo il server (Edge Function, service role) importa: dal browser niente.
revoke all on function public.maestro_import(uuid, date) from public, anon, authenticated;
revoke all on function public.maestro_crea_controparte(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.maestro_crea_documento(uuid, text, text, integer, text, date, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.maestro_righe(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.maestro_import(uuid, date) to service_role;
grant execute on function public.maestro_crea_controparte(uuid, text, text, jsonb) to service_role;
grant execute on function public.maestro_crea_documento(uuid, text, text, integer, text, date, uuid, jsonb, jsonb) to service_role;
grant execute on function public.maestro_righe(uuid, text, integer) to service_role;
