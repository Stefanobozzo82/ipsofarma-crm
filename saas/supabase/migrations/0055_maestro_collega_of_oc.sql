-- 0055 — Collegamento ordine fornitore → ordini cliente più tollerante.
-- Prima un OF si collegava solo se un UNICO ordine cliente conteneva tutti i
-- suoi articoli: saltava quando nello stesso OF si aggiungeva merce per il
-- magazzino o si riunivano più ordini cliente (OF 230, 232, 236, 238, 244,
-- 248, 255 dell'ottobre 2026). Ora, se la regola di prima non trova un unico
-- ordine, si collegano gli ordini cliente non ancora collegati i cui articoli
-- stanno tutti nell'OF (quantità comprese, sommando più ordini), con la
-- precedenza a quello con lo stesso numero. extra.ocId resta il primo ordine
-- (compatibilità), extra.ocIds li elenca tutti.
create or replace function public.maestro_collega_fornitori(p_company_id uuid, p_dal date DEFAULT '2026-01-01'::date)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare f record; o record; c record; v_m jsonb; v_need jsonb; v_of record; v_oc_id uuid; v_oc_num text; v_n integer;
  v_left jsonb; v_q jsonb; v_ok boolean; v_nums jsonb;
  v_righe integer := 0; v_fatture integer := 0; v_ordini integer := 0;
begin
  for f in
    select x.id, x.righe, l.numreg from fatture_fornitore x
    join maestro_import_log l on l.company_id = x.company_id and l.tabella = 'ACQUISTI' and l.doc_id = x.id
    where x.company_id = p_company_id and x.data >= p_dal
      and jsonb_array_length(x.righe) = 1 and upper(btrim(x.righe->0->>'cod')) = 'VARIE'
  loop
    v_m := maestro_righe(p_company_id, 'ARCART_A', f.numreg);
    continue when jsonb_array_length(v_m) = 0
      or round(invoice_gross_total(v_m), 2) <> round(invoice_gross_total(f.righe), 2);
    update fatture_fornitore set righe = v_m where id = f.id;
    v_righe := v_righe + 1;
  end loop;
  for f in
    select x.id, x.num, x.data, x.fornitore_id, l.numreg from fatture_fornitore x
    join maestro_import_log l on l.company_id = x.company_id and l.tabella = 'ACQUISTI' and l.doc_id = x.id
    where x.company_id = p_company_id and x.data >= p_dal and x.of_id is null
      and invoice_gross_total(x.righe) > 0
    order by x.data, x.num
  loop
    v_need := maestro_qta_per_codice(maestro_righe(p_company_id, 'ARCART_A', f.numreg));
    continue when v_need = '{}'::jsonb;
    select ord.id, ord.num into v_of from ordini_fornitore ord
    where ord.company_id = p_company_id and ord.fornitore_id = f.fornitore_id
      and ord.data between f.data - 120 and f.data and coalesce(ord.extra->>'annullato', '') <> 'true'
      and not exists (
        select 1 from jsonb_each_text(v_need) n(cod, q)
        where n.q::numeric > coalesce((maestro_qta_per_codice(ord.righe)->>n.cod)::numeric, 0)
          - coalesce((select sum(coalesce((fx.q->>n.cod)::numeric, 0))
                      from (select maestro_qta_per_codice(y.righe) q from fatture_fornitore y
                            where y.company_id = p_company_id and y.of_id = ord.id) fx), 0))
    order by ord.data desc, ord.num desc limit 1;
    continue when v_of.id is null;
    update fatture_fornitore set of_id = v_of.id where id = f.id;
    update ordini_fornitore set
        ftf_ids = case when ftf_ids ? f.num then ftf_ids else ftf_ids || to_jsonb(f.num) end,
        extra = extra || jsonb_build_object('ftfId', f.num)
      where id = v_of.id;
    v_fatture := v_fatture + 1;
  end loop;
  for o in
    select x.id, x.num, x.data, x.righe from ordini_fornitore x
    where x.company_id = p_company_id and x.data >= p_dal and coalesce(x.extra->>'ocId', '') = ''
      and coalesce(x.extra->>'annullato', '') <> 'true' and jsonb_array_length(x.righe) > 0
    order by x.data, x.num
  loop
    v_need := maestro_qta_per_codice(o.righe);
    continue when v_need = '{}'::jsonb;
    -- 1) Come prima: un unico ordine cliente che contiene tutto l'OF.
    select count(*), (array_agg(oc.id))[1], (array_agg(oc.num))[1] into v_n, v_oc_id, v_oc_num
    from ordini_cliente oc
    where oc.company_id = p_company_id and oc.data between o.data - 15 and o.data
      and coalesce(oc.extra->>'annullato', '') <> 'true'
      and not exists (select 1 from jsonb_each_text(v_need) n(cod, q)
                      where n.q::numeric > coalesce((maestro_qta_per_codice(oc.righe)->>n.cod)::numeric, 0));
    if v_n = 1 then
      update ordini_fornitore set extra = extra || jsonb_build_object('ocId', v_oc_num, 'ocIds', jsonb_build_array(v_oc_num)) where id = o.id;
      update ordini_cliente set extra = extra || jsonb_build_object('ofId', o.num,
          'ofIds', case when coalesce(extra->'ofIds', '[]') ? o.num then coalesce(extra->'ofIds', '[]')
                        else coalesce(extra->'ofIds', '[]') || to_jsonb(o.num) end)
        where id = v_oc_id;
      v_ordini := v_ordini + 1;
      continue;
    end if;
    -- 2) Ordini cliente non ancora collegati i cui articoli stanno tutti
    --    nell'OF (anche più di uno, sommando le quantità): prima quello con
    --    lo stesso numero, poi il più recente.
    v_left := v_need; v_nums := '[]'::jsonb; v_oc_num := null;
    for c in
      select oc.id, oc.num, maestro_qta_per_codice(oc.righe) q from ordini_cliente oc
      where oc.company_id = p_company_id and oc.data between o.data - 15 and o.data
        and coalesce(oc.extra->>'annullato', '') <> 'true'
        and coalesce(oc.extra->'ofIds', '[]') = '[]' and coalesce(oc.extra->>'ofId', '') = ''
        and jsonb_array_length(oc.righe) > 0
      order by (split_part(oc.num, '/', 3) = split_part(o.num, '/', 3)) desc, oc.data desc, oc.num desc
    loop
      v_q := c.q;
      continue when v_q = '{}'::jsonb;
      select not exists (select 1 from jsonb_each_text(v_q) n(cod, q)
                         where n.q::numeric > coalesce((v_left->>n.cod)::numeric, 0)) into v_ok;
      continue when not v_ok;
      select coalesce(jsonb_object_agg(k.cod, (k.q::numeric - coalesce((v_q->>k.cod)::numeric, 0))), '{}'::jsonb)
        into v_left from jsonb_each_text(v_left) k(cod, q);
      v_nums := v_nums || to_jsonb(c.num);
      if v_oc_num is null then v_oc_num := c.num; end if;
      update ordini_cliente set extra = extra || jsonb_build_object('ofId', o.num, 'ofIds', jsonb_build_array(o.num)) where id = c.id;
    end loop;
    continue when v_oc_num is null;
    update ordini_fornitore set extra = extra || jsonb_build_object('ocId', v_oc_num, 'ocIds', v_nums) where id = o.id;
    v_ordini := v_ordini + 1;
  end loop;
  return jsonb_build_object('righe_fatture_fornitori', v_righe, 'fatture_fornitori_collegate', v_fatture,
                            'ordini_fornitori_collegati', v_ordini);
end;
$function$;
