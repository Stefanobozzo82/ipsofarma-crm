-- 0048, completamento: una fattura "differita" di Maestro non ha righe sue,
-- le prende dai DDT fatturati (NRIFPERBOL), come già fa maestro_import per
-- crearla. Anche il confronto delle modifiche deve guardare quelle righe,
-- altrimenti per quasi tutte le fatture di vendita non c'era niente da
-- confrontare.
do $$
declare def text; nuova text;
begin
  def := pg_get_functiondef('public.maestro_aggiorna_modificati(uuid)'::regprocedure);
  nuova := replace(def,
$r$    v_m := maestro_righe(p_company_id, v_lines, l.numreg);
$r$,
$r$    v_m := maestro_righe(p_company_id, v_lines, l.numreg);
    if l.tabella = 'VENDITE' and jsonb_array_length(v_m) = 0 then
      select coalesce(jsonb_agg(e.r order by b.n, e.i), '[]'::jsonb) into v_m
      from (select (m.dati->>'NUMREG')::integer n from maestro_records m
            where m.company_id = p_company_id and m.tabella = 'BOLLE' and not m.deleted
              and m.dati->>'NRIFPERBOL' = l.numreg::text) b,
           lateral jsonb_array_elements(maestro_righe(p_company_id, 'ARCART_B', b.n)) with ordinality e(r, i);
    end if;
$r$);
  if nuova = def then raise exception 'maestro_aggiorna_modificati: punto da modificare non trovato'; end if;
  execute nuova;
end$$;

select public.maestro_aggiorna_modificati(c) from (select distinct company_id c from public.maestro_import_log) x;
