-- Optimistic supplier order editing; receipt metadata and invoice links stay authoritative.
create or replace function public.update_supplier_order(
  p_company_id uuid,p_order_id uuid,p_expected jsonb,p_document jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.ordini_fornitore%rowtype; v_snapshot jsonb; v_row jsonb; v_old jsonb;
  v_rows jsonb := '[]'::jsonb; v_seen integer[] := '{}'; v_index integer; v_position integer;
  v_ev numeric; v_extra jsonb; v_key text; v_tracked boolean; v_num text; v_match text[];
  v_client uuid; v_date date;
begin
  if auth.uid() is null then raise exception 'accesso richiesto'; end if;
  perform 1 from public.memberships where company_id=p_company_id and user_id=auth.uid()
    and role in ('admin','operatore') for share;
  if not found then raise exception 'operazione non autorizzata per questa azienda'; end if;
  select * into v_order from public.ordini_fornitore where id=p_order_id and company_id=p_company_id for update;
  if not found then raise exception 'ordine non disponibile per questa azienda'; end if;
  v_snapshot := jsonb_build_object('num',v_order.num,'data',v_order.data,'fornitore_id',v_order.fornitore_id,
    'ftf_ids',v_order.ftf_ids,'righe',v_order.righe,'extra',v_order.extra);
  if p_expected is distinct from v_snapshot then raise exception 'ordine modificato: ricarica prima di salvare'; end if;
  if jsonb_typeof(p_document) is distinct from 'object'
    or jsonb_typeof(p_document->'righe') is distinct from 'array'
    or jsonb_typeof(p_document->'extra') is distinct from 'object'
    or jsonb_typeof(p_document->'num') is distinct from 'string'
    or jsonb_typeof(p_document->'fornitore_id') is distinct from 'string'
    or jsonb_typeof(p_document->'data') is distinct from 'string' then
    raise exception 'documento ordine non valido';
  end if;
  if jsonb_array_length(p_document->'righe')=0 then raise exception 'almeno una riga ordine richiesta'; end if;
  v_num := trim(p_document->>'num');
  if v_num='' or (p_document->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'numero o data ordine non validi'; end if;
  v_date := (p_document->>'data')::date;
  v_client := (p_document->>'fornitore_id')::uuid;
  perform 1 from public.fornitori where id=v_client and company_id=p_company_id for share;
  if not found then raise exception 'fornitore non disponibile per questa azienda'; end if;
  select exists(select 1 from public.supplier_ddt_operations where company_id=p_company_id and order_id=p_order_id) into v_tracked;
  if v_tracked and (jsonb_array_length(p_document->'righe')<>jsonb_array_length(v_order.righe) or v_client<>v_order.fornitore_id) then
    raise exception 'ordine con DDT collegati: fornitore e struttura righe non modificabili';
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
        raise exception 'una riga ricevuta non può cambiare codice o scendere sotto la quantità ricevuta';
      end if;
      if v_row ? 'qtyEv' and (jsonb_typeof(v_row->'qtyEv') is distinct from 'number' or (v_row->>'qtyEv')::numeric<>v_ev) then
        raise exception 'la quantità ricevuta è gestita dai documenti di consegna';
      end if;
      if v_old ? 'line_id' and v_row ? 'line_id' and v_row->'line_id' is distinct from v_old->'line_id' then
        raise exception 'identità riga ordine non modificabile';
      end if;
      v_row := v_old || (v_row-'source_order_index'-'qtyEv'-'consegnato'-'residuo');
    else
      if v_tracked then raise exception 'ordine con DDT collegati: aggiunta righe non consentita'; end if;
      if v_row ? 'qtyEv' and (jsonb_typeof(v_row->'qtyEv') is distinct from 'number' or (v_row->>'qtyEv')::numeric<>0) then
        raise exception 'una nuova riga non può risultare già ricevuta';
      end if;
      v_row := v_row-'qtyEv'-'consegnato'-'residuo';
    end if;
    v_rows := v_rows||jsonb_build_array(v_row);
  end loop;
  for v_old,v_index in select value,ordinality::integer-1 from jsonb_array_elements(v_order.righe) with ordinality loop
    if coalesce((v_old->>'qtyEv')::numeric,0)>0 and not v_index=any(v_seen) then
      raise exception 'una riga già ricevuta non può essere rimossa';
    end if;
  end loop;
  foreach v_key in array array['ocId','ddtfId','ddtfIds','ftfId','ftfIds'] loop
    if p_document->'extra' ? v_key and (p_document->'extra'->v_key) is distinct from (v_order.extra->v_key) then
      raise exception 'i collegamenti ai documenti sono gestiti dalle operazioni dedicate';
    end if;
  end loop;
  if p_document ? 'ftf_ids' and p_document->'ftf_ids' is distinct from v_order.ftf_ids then
    raise exception 'i collegamenti alle fatture sono gestiti dalle operazioni dedicate';
  end if;
  v_extra := v_order.extra || (p_document->'extra');
  if v_num<>v_order.num then
    v_match := regexp_match(v_num,'^OF/([0-9]{4})/([0-9]+)$');
    if v_match is not null then perform public.bump_document_counter(p_company_id,'OF',v_match[1]::integer,v_match[2]::integer+1); end if;
  end if;
  update public.ordini_fornitore set num=v_num,data=v_date,fornitore_id=v_client,righe=v_rows,extra=v_extra
    where id=p_order_id and company_id=p_company_id returning * into v_order;
  return to_jsonb(v_order);
end;
$$;
revoke all on function public.update_supplier_order(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.update_supplier_order(uuid,uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
