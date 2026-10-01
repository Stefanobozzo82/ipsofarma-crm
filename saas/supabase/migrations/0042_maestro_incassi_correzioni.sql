-- Sincronizzazione incassi da Maestro (0041), correzioni:
--  * una nota di credito di Maestro registrata nel gestionale come fattura
--    negativa ora si chiude anche lei, con importi negativi;
--  * una fattura saldata in Maestro risulta saldata anche nel gestionale
--    quando i due programmi arrotondano l'IVA in modo diverso: la differenza
--    di qualche centesimo va sull'ultimo pagamento.

create or replace function public.maestro_sync_incassi(p_company_id uuid) returns integer
language plpgsql set search_path = public as $$
declare r record; v_inc jsonb; v_before jsonb; v_after jsonb; v_n integer := 0; v_tab text; v_tot numeric; v_somma numeric; v_k integer;
begin
  for r in
    select l.doc_id, l.numreg, m.dati
    from maestro_import_log l
    join maestro_records m on m.company_id = l.company_id and m.tabella = l.tabella and not m.deleted
                          and m.dati->>'NUMREG' = l.numreg::text
    where l.company_id = p_company_id and l.esito in ('importato', 'presente') and l.doc_id is not null
      and l.tabella in ('VENDITE', 'ACQUISTI')
      and (coalesce((m.dati->>'PAGATO')::boolean, false)
           or exists (select 1 from generate_series(1, 6) g where coalesce((m.dati->>('SRATA' || g))::boolean, false)))
  loop
    -- La tabella è quella dove il documento sta davvero: una nota di credito
    -- di Maestro può essere registrata nel gestionale come fattura negativa.
    v_tab := case when exists (select 1 from fatture_cliente where id = r.doc_id) then 'fatture_cliente'
                  when exists (select 1 from fatture_fornitore where id = r.doc_id) then 'fatture_fornitore' end;
    continue when v_tab is null;
    execute format('select jsonb_build_object(''pagamenti'', pagamenti, ''paid'', paid, ''paid_date'', paid_date, ''data'', data,
                      ''totale'', public.invoice_gross_total(righe))
                    from public.%I where company_id = $1 and id = $2 for update', v_tab)
      into v_before using p_company_id, r.doc_id;
    continue when v_before is null or jsonb_array_length(coalesce(v_before->'pagamenti', '[]')) > 0;
    -- Chiusa (anche in parte) da note di credito: va riconciliata a mano.
    continue when invoice_credit_total(p_company_id, case v_tab when 'fatture_cliente' then 'customer' else 'supplier' end, r.doc_id) > 0;
    v_inc := maestro_incassi(r.dati, (v_before->>'data')::date);
    continue when jsonb_array_length(v_inc->'pagamenti') = 0;
    v_tot := (v_before->>'totale')::numeric;
    if v_tot < 0 then
      -- Fattura negativa (nota di credito): gli importi hanno il suo segno.
      v_inc := jsonb_set(v_inc, '{pagamenti}', (select jsonb_agg(p || jsonb_build_object('importo', -abs((p->>'importo')::numeric)))
                                                 from jsonb_array_elements(v_inc->'pagamenti') p));
    end if;
    select sum((p->>'importo')::numeric) into v_somma from jsonb_array_elements(v_inc->'pagamenti') p;
    if (v_inc->>'paid')::boolean and v_somma <> v_tot and abs(v_somma - v_tot) < 1 then
      -- Saldata in Maestro: i centesimi di arrotondamento dell'IVA (calcolata
      -- in modo diverso dai due programmi) vanno sull'ultimo pagamento.
      v_k := jsonb_array_length(v_inc->'pagamenti') - 1;
      v_inc := jsonb_set(v_inc, array['pagamenti', v_k::text, 'importo'],
                         to_jsonb(round(((v_inc->'pagamenti'->v_k->>'importo')::numeric + v_tot - v_somma), 2)));
    end if;
    -- Una fattura segnata pagata senza incassi registrati (storico) resta pagata.
    v_after := jsonb_build_object('pagamenti', v_inc->'pagamenti',
      'paid', (v_inc->>'paid')::boolean or coalesce((v_before->>'paid')::boolean, false),
      'paid_date', coalesce(v_inc->>'paid_date', case when (v_before->>'paid')::boolean then v_before->>'paid_date' end));
    execute format('update public.%I set pagamenti = $3, paid = $4, paid_date = $5 where company_id = $1 and id = $2', v_tab)
      using p_company_id, r.doc_id, v_after->'pagamenti', (v_after->>'paid')::boolean, (v_after->>'paid_date')::date;
    insert into invoice_payment_operations (company_id, request_id, actor_id, invoice_kind, invoice_id, action, payload, before_state, after_state, result, created_at)
    values (p_company_id, gen_random_uuid(), null, case v_tab when 'fatture_cliente' then 'customer' else 'supplier' end,
            r.doc_id, 'maestro_sync', jsonb_build_object('fonte', 'maestro', 'numreg', r.numreg),
            v_before - 'data' - 'totale', v_after, v_after, now());
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

grant execute on function public.invoice_gross_total(jsonb) to service_role;
