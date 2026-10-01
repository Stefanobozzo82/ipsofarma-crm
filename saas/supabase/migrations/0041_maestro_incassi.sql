-- Import Maestro, terzo passo: incassi e pagamenti con la data effettiva.
--
-- In Maestro una fattura si segna incassata (o pagata, per i fornitori)
-- rata per rata: SRATAn diventa vero e DRATAn, che prima era la scadenza,
-- prende la data effettiva del pagamento; PRATAn è l'importo della rata.
-- maestro_incassi() ne ricava i pagamenti nel formato del gestionale e
-- maestro_sync_incassi() li porta sulle fatture già importate o già presenti,
-- a ogni import: solo su quelle che nel gestionale non hanno ancora nessun
-- pagamento registrato, così un incasso inserito a mano non viene toccato,
-- e senza note di credito collegate (lì Maestro segna saldata una rata che
-- in realtà è compensata dalla nota, non incassata).

create or replace function public.maestro_incassi(d jsonb, p_data date) returns jsonb
language plpgsql stable set search_path = public as $$
declare i integer; v_rate integer := 0; v_saldate integer := 0; v_pag jsonb := '[]'; v_dt date; v_last date; v_paid boolean;
begin
  for i in 1..6 loop
    continue when not coalesce((d->>('LRATA' || i))::boolean, false) and coalesce(maestro_numero(d->>('PRATA' || i)), 0) = 0;
    v_rate := v_rate + 1;
    if coalesce((d->>('SRATA' || i))::boolean, false) then
      v_saldate := v_saldate + 1;
      v_dt := least(coalesce(case when d->>('DRATA' || i) ~ '^\d{4}-\d{2}-\d{2}$' then (d->>('DRATA' || i))::date end, p_data), current_date);
      v_pag := v_pag || jsonb_build_object('data', v_dt, 'importo', coalesce(maestro_numero(d->>('PRATA' || i)), 0));
      v_last := greatest(v_last, v_dt);
    end if;
  end loop;
  v_paid := (v_saldate > 0 and v_saldate >= v_rate) or coalesce(maestro_numero(d->>'PSALDO'), 0) >= 100
            or coalesce((d->>'PAGATO')::boolean, false);
  if v_paid and jsonb_array_length(v_pag) = 0 then
    -- Segnata pagata senza rate saldate: data della prima rata, importo totale.
    v_last := least(coalesce(case when d->>'DRATA1' ~ '^\d{4}-\d{2}-\d{2}$' then (d->>'DRATA1')::date end, p_data), current_date);
    v_pag := jsonb_build_array(jsonb_build_object('data', v_last, 'importo', coalesce(maestro_numero(d->>'TOTALE'), 0)));
  end if;
  return jsonb_build_object('pagamenti', v_pag, 'paid', v_paid, 'paid_date', case when v_paid then v_last end);
end;
$$;

create or replace function public.maestro_sync_incassi(p_company_id uuid) returns integer
language plpgsql set search_path = public as $$
declare r record; v_inc jsonb; v_before jsonb; v_after jsonb; v_n integer := 0;
begin
  for r in
    select l.doc_tipo, l.doc_id, l.numreg, m.dati
    from maestro_import_log l
    join maestro_records m on m.company_id = l.company_id and m.tabella = l.tabella and not m.deleted
                          and m.dati->>'NUMREG' = l.numreg::text
    where l.company_id = p_company_id and l.esito in ('importato', 'presente') and l.doc_id is not null
      and l.doc_tipo in ('fatture_cliente', 'fatture_fornitore')
      and (coalesce((m.dati->>'PAGATO')::boolean, false)
           or exists (select 1 from generate_series(1, 6) g where coalesce((m.dati->>('SRATA' || g))::boolean, false)))
  loop
    execute format('select jsonb_build_object(''pagamenti'', pagamenti, ''paid'', paid, ''paid_date'', paid_date, ''data'', data)
                    from public.%I where company_id = $1 and id = $2 for update', r.doc_tipo)
      into v_before using p_company_id, r.doc_id;
    continue when v_before is null or jsonb_array_length(coalesce(v_before->'pagamenti', '[]')) > 0;
    -- Chiusa (anche in parte) da note di credito: va riconciliata a mano.
    continue when invoice_credit_total(p_company_id, case r.doc_tipo when 'fatture_cliente' then 'customer' else 'supplier' end, r.doc_id) > 0;
    v_inc := maestro_incassi(r.dati, (v_before->>'data')::date);
    continue when jsonb_array_length(v_inc->'pagamenti') = 0;
    -- Una fattura segnata pagata senza incassi registrati (storico) resta pagata.
    v_after := jsonb_build_object('pagamenti', v_inc->'pagamenti',
      'paid', (v_inc->>'paid')::boolean or coalesce((v_before->>'paid')::boolean, false),
      'paid_date', coalesce(v_inc->>'paid_date', case when (v_before->>'paid')::boolean then v_before->>'paid_date' end));
    execute format('update public.%I set pagamenti = $3, paid = $4, paid_date = $5 where company_id = $1 and id = $2', r.doc_tipo)
      using p_company_id, r.doc_id, v_after->'pagamenti', (v_after->>'paid')::boolean, (v_after->>'paid_date')::date;
    insert into invoice_payment_operations (company_id, request_id, actor_id, invoice_kind, invoice_id, action, payload, before_state, after_state, result, created_at)
    values (p_company_id, gen_random_uuid(), null, case r.doc_tipo when 'fatture_cliente' then 'customer' else 'supplier' end,
            r.doc_id, 'maestro_sync', jsonb_build_object('fonte', 'maestro', 'numreg', r.numreg),
            v_before - 'data', v_after, v_after, now());
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.maestro_sync_incassi(uuid) from public, anon, authenticated;
grant execute on function public.maestro_sync_incassi(uuid) to service_role;
-- Serve alla sincronizzazione per riconoscere le fatture chiuse da note di credito.
grant execute on function public.invoice_credit_total(uuid, text, uuid) to service_role;

create or replace function public.maestro_crea_documento(
  p_company_id uuid, p_target text, p_tab text, p_numreg integer, p_num text, p_data date,
  p_party uuid, p_righe jsonb, d jsonb)
returns uuid language plpgsql set search_path = public as $$
declare
  v_id uuid; v_note text := coalesce(btrim(d->>'ANNOTAZ'), '');
  v_inc jsonb := maestro_incassi(d, p_data);
  v_paid boolean := false;
  v_paid_date date; v_pagamenti jsonb := '[]'; v_ddt record; v_righe jsonb := p_righe;
begin
  if p_target in ('fatture_cliente', 'fatture_fornitore') then
    v_paid := (v_inc->>'paid')::boolean;
    v_paid_date := (v_inc->>'paid_date')::date;
    v_pagamenti := v_inc->'pagamenti';
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
  v_c record; v_t text; v_score integer; v_best integer; v_i integer; v_incassi integer;
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

  v_incassi := maestro_sync_incassi(p_company_id);

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
      'incassi', v_incassi,
      'da_verificare', (select count(*) from maestro_import_log where company_id = p_company_id and esito = 'conflitto'),
      'in_attesa', (select count(*) from maestro_import_log where company_id = p_company_id and esito = 'in_attesa')),
    now())
  returning id into v_run;
  return (select report || jsonb_build_object('run_id', id) from maestro_sync_runs where id = v_run);
end;
$$;
