-- Optimistic editor saves. Legacy callers remain supported with a narrower
-- guard against erasing fulfillment; they do not gain full optimistic locking.
create or replace function public.guard_customer_order_legacy_update()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_index integer; v_ev numeric; v_next_ev numeric;
  v_family text; v_refs jsonb; v_next_refs jsonb; v_tracked boolean;
begin
  -- SECURITY INVOKER: current_user is the real SQL execution role, not a JWT
  -- field or caller-controlled setting. Trusted server/definer paths bypass.
  if current_user not in ('authenticated','anon') then return new; end if;
  if new.id is distinct from old.id or new.company_id is distinct from old.company_id then
    raise exception 'identità ordine non modificabile';
  end if;
  if jsonb_typeof(new.righe) is distinct from 'array' then raise exception 'righe ordine non valide'; end if;
  -- The private operations table cannot be read by the invoker. Existing DDT
  -- rows with source indexes identify the same protected structure through RLS.
  select exists(select 1 from public.ddt d where d.company_id=old.company_id and d.oc_id=old.id
    and exists(select 1 from jsonb_array_elements(d.righe) r where r ? 'source_order_index')) into v_tracked;
  if v_tracked and jsonb_array_length(new.righe) <> jsonb_array_length(old.righe) then
    raise exception 'ordine con DDT collegati: struttura righe non modificabile';
  end if;
  for v_old,v_index in select value,ordinality::integer-1 from jsonb_array_elements(old.righe) with ordinality loop
    v_new := new.righe->v_index;
    v_ev := coalesce((v_old->>'qtyEv')::numeric,0);
    if v_tracked and (v_new-'qtyEv') is distinct from (v_old-'qtyEv') then
      raise exception 'ordine con DDT collegati: riapri l''ordine per modificarlo in sicurezza';
    end if;
    if v_ev > 0 then
      if v_new is null or v_new->>'cod' is distinct from v_old->>'cod'
        or jsonb_typeof(v_new->'qtyEv') is distinct from 'number'
        or jsonb_typeof(v_new->'qty') is distinct from 'number' then
        raise exception 'una riga già consegnata non può essere rimossa o sostituita';
      end if;
      v_next_ev := (v_new->>'qtyEv')::numeric;
      if v_next_ev < v_ev or (v_new->>'qty')::numeric < v_next_ev then
        raise exception 'le quantità già consegnate non possono essere ridotte dal salvataggio ordine';
      end if;
    end if;
  end loop;
  foreach v_family in array array['ddt','ft','of'] loop
    v_refs := coalesce(nullif(old.extra->(v_family||'Ids'),'null'::jsonb),'[]'::jsonb);
    v_next_refs := coalesce(nullif(new.extra->(v_family||'Ids'),'null'::jsonb),'[]'::jsonb);
    if jsonb_typeof(v_refs) <> 'array' or jsonb_typeof(v_next_refs) <> 'array' then
      raise exception 'collegamenti ordine non validi';
    end if;
    if jsonb_typeof(old.extra->(v_family||'Id'))='string' then v_refs := v_refs||jsonb_build_array(old.extra->>(v_family||'Id')); end if;
    if jsonb_typeof(new.extra->(v_family||'Id'))='string' then v_next_refs := v_next_refs||jsonb_build_array(new.extra->>(v_family||'Id')); end if;
    if not v_next_refs @> v_refs then raise exception 'i collegamenti esistenti non possono essere rimossi dal salvataggio ordine'; end if;
  end loop;
  return new;
end;
$$;
create trigger customer_order_legacy_update_guard before update on public.ordini_cliente
  for each row execute function public.guard_customer_order_legacy_update();

create or replace function public.update_customer_order(
  p_company_id uuid,p_order_id uuid,p_expected jsonb,p_document jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.ordini_cliente%rowtype; v_snapshot jsonb; v_row jsonb; v_old jsonb;
  v_rows jsonb := '[]'::jsonb; v_seen integer[] := '{}'; v_index integer; v_position integer;
  v_ev numeric; v_extra jsonb; v_key text; v_tracked boolean; v_num text; v_match text[];
  v_client uuid; v_date date;
begin
  if auth.uid() is null then raise exception 'accesso richiesto'; end if;
  perform 1 from public.memberships where company_id=p_company_id and user_id=auth.uid()
    and role in ('admin','operatore') for share;
  if not found then raise exception 'operazione non autorizzata per questa azienda'; end if;
  select * into v_order from public.ordini_cliente where id=p_order_id and company_id=p_company_id for update;
  if not found then raise exception 'ordine non disponibile per questa azienda'; end if;
  v_snapshot := jsonb_build_object('num',v_order.num,'data',v_order.data,'cliente_id',v_order.cliente_id,
    'dest_id',v_order.dest_id,'righe',v_order.righe,'extra',v_order.extra);
  if p_expected is distinct from v_snapshot then raise exception 'ordine modificato: ricarica prima di salvare'; end if;
  if jsonb_typeof(p_document) is distinct from 'object'
    or jsonb_typeof(p_document->'righe') is distinct from 'array'
    or jsonb_typeof(p_document->'extra') is distinct from 'object'
    or jsonb_typeof(p_document->'num') is distinct from 'string'
    or jsonb_typeof(p_document->'cliente_id') is distinct from 'string'
    or jsonb_typeof(p_document->'data') is distinct from 'string' then
    raise exception 'documento ordine non valido';
  end if;
  if jsonb_array_length(p_document->'righe')=0 then raise exception 'almeno una riga ordine richiesta'; end if;
  if p_document ? 'dest_id' and jsonb_typeof(p_document->'dest_id') not in ('null','string') then
    raise exception 'destinazione ordine non valida';
  end if;
  v_num := trim(p_document->>'num');
  if v_num='' or (p_document->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'numero o data ordine non validi'; end if;
  v_date := (p_document->>'data')::date;
  v_client := (p_document->>'cliente_id')::uuid;
  perform 1 from public.clienti where id=v_client and company_id=p_company_id for share;
  if not found then raise exception 'cliente non disponibile per questa azienda'; end if;
  select exists(select 1 from public.customer_ddt_operations where company_id=p_company_id and order_id=p_order_id) into v_tracked;
  if v_tracked and (jsonb_array_length(p_document->'righe')<>jsonb_array_length(v_order.righe) or v_client<>v_order.cliente_id) then
    raise exception 'ordine con DDT collegati: cliente e struttura righe non modificabili';
  end if;
  for v_row,v_position in select value,ordinality::integer-1 from jsonb_array_elements(p_document->'righe') with ordinality loop
    if jsonb_typeof(v_row) is distinct from 'object' or jsonb_typeof(v_row->'qty') is distinct from 'number'
      or (v_row->>'qty')::numeric <= 0 then raise exception 'quantità riga ordine non valida'; end if;
    if v_row ? 'source_order_index' then
      if jsonb_typeof(v_row->'source_order_index') is distinct from 'number' then raise exception 'riferimento riga ordine non valido'; end if;
      if (v_row->>'source_order_index')::numeric<>trunc((v_row->>'source_order_index')::numeric)
        or (v_row->>'source_order_index')::numeric<0 or (v_row->>'source_order_index')::numeric>=jsonb_array_length(v_order.righe) then
        raise exception 'riferimento riga ordine non valido';
      end if;
      v_index := (v_row->>'source_order_index')::numeric::integer;
      if v_index=any(v_seen) then raise exception 'una riga ordine è stata utilizzata più volte'; end if;
      v_seen := array_append(v_seen,v_index);
      if v_tracked and v_index<>v_position then raise exception 'ordine con DDT collegati: riordino righe non consentito'; end if;
      v_old := v_order.righe->v_index;
      v_ev := coalesce((v_old->>'qtyEv')::numeric,0);
      if (v_row->>'qty')::numeric<v_ev or ((v_ev>0 or v_tracked) and v_row->>'cod' is distinct from v_old->>'cod') then
        raise exception 'una riga consegnata non può cambiare codice o scendere sotto la quantità consegnata';
      end if;
      if v_row ? 'qtyEv' and (jsonb_typeof(v_row->'qtyEv') is distinct from 'number' or (v_row->>'qtyEv')::numeric<>v_ev) then
        raise exception 'la quantità consegnata è gestita dai documenti di consegna';
      end if;
      if v_old ? 'line_id' and v_row ? 'line_id' and v_row->'line_id' is distinct from v_old->'line_id' then
        raise exception 'identità riga ordine non modificabile';
      end if;
      v_row := v_old || (v_row-'source_order_index'-'qtyEv'-'consegnato'-'residuo');
    else
      if v_tracked then raise exception 'ordine con DDT collegati: aggiunta righe non consentita'; end if;
      if v_row ? 'qtyEv' and (jsonb_typeof(v_row->'qtyEv') is distinct from 'number' or (v_row->>'qtyEv')::numeric<>0) then
        raise exception 'una nuova riga non può risultare già consegnata';
      end if;
      v_row := v_row-'qtyEv'-'consegnato'-'residuo';
    end if;
    v_rows := v_rows||jsonb_build_array(v_row);
  end loop;
  for v_old,v_index in select value,ordinality::integer-1 from jsonb_array_elements(v_order.righe) with ordinality loop
    if coalesce((v_old->>'qtyEv')::numeric,0)>0 and not v_index=any(v_seen) then
      raise exception 'una riga già consegnata non può essere rimossa';
    end if;
  end loop;
  foreach v_key in array array['ddtId','ddtIds','ftId','ftIds','ofId','ofIds'] loop
    if p_document->'extra' ? v_key and (p_document->'extra'->v_key) is distinct from (v_order.extra->v_key) then
      raise exception 'i collegamenti ai documenti sono gestiti dalle operazioni dedicate';
    end if;
  end loop;
  v_extra := v_order.extra || (p_document->'extra');
  if v_num<>v_order.num then
    v_match := regexp_match(v_num,'^OC/([0-9]{4})/([0-9]+)$');
    if v_match is not null then perform public.bump_document_counter(p_company_id,'OC',v_match[1]::integer,v_match[2]::integer+1); end if;
  end if;
  update public.ordini_cliente set num=v_num,data=v_date,cliente_id=v_client,dest_id=p_document->>'dest_id',righe=v_rows,extra=v_extra
    where id=p_order_id and company_id=p_company_id returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.update_customer_order(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_customer_order(uuid,uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
