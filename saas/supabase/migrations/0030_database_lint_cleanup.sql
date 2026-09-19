-- Additive lint cleanup after 0029. Explicit literal types and a distinct loop
-- variable preserve behavior. Static quota counts avoid dynamic-SQL lint guesses.
-- CREATE OR REPLACE retains existing ownership, EXECUTE ACL and trigger callers.

create or replace function public.update_customer_order(
  p_company_id uuid,p_order_id uuid,p_expected jsonb,p_document jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.ordini_cliente%rowtype; v_snapshot jsonb; v_row jsonb; v_old jsonb;
  v_rows jsonb := '[]'::jsonb; v_seen integer[] := '{}'::integer[]; v_index integer; v_position integer;
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

create or replace function public.customer_ddt_quantities(p_rows jsonb,p_order_rows jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare v_row jsonb; v_i integer; v_qty numeric; v_totals jsonb:='{}'::jsonb;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'righe DDT non valide'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row->'source_order_index') is distinct from 'number'
      or (v_row->>'source_order_index') !~ '^[0-9]+$' then
      raise exception 'collegamento riga mancante: ricreare la riga dall''ordine';
    end if;
    v_i:=(v_row->>'source_order_index')::integer;
    if v_i>=jsonb_array_length(p_order_rows)
      or v_row->>'cod' is distinct from p_order_rows->v_i->>'cod' then
      raise exception 'collegamento riga ordine non più valido';
    end if;
    if jsonb_typeof(v_row->'qty') is distinct from 'number' then raise exception 'quantità non valida'; end if;
    v_qty:=(v_row->>'qty')::numeric;
    if v_qty<=0 then raise exception 'quantità non positiva'; end if;
    v_totals:=jsonb_set(v_totals,array[v_i::text],to_jsonb(coalesce((v_totals->>v_i::text)::numeric,0)+v_qty),true);
  end loop;
  return v_totals;
end;
$$;

create or replace function public.supplier_ddt_quantities(p_rows jsonb,p_order_rows jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare v_row jsonb; v_i integer; v_qty numeric; v_totals jsonb:='{}'::jsonb;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'righe DDT non valide'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row->'source_order_index') is distinct from 'number'
      or (v_row->>'source_order_index') !~ '^[0-9]+$' then
      raise exception 'collegamento riga mancante: ricreare la riga dall''ordine';
    end if;
    v_i:=(v_row->>'source_order_index')::integer;
    if v_i>=jsonb_array_length(p_order_rows)
      or v_row->>'cod' is distinct from p_order_rows->v_i->>'cod' then
      raise exception 'collegamento riga ordine non più valido';
    end if;
    if jsonb_typeof(v_row->'qty') is distinct from 'number' then raise exception 'quantità non valida'; end if;
    v_qty:=(v_row->>'qty')::numeric;
    if v_qty<=0 then raise exception 'quantità non positiva'; end if;
    v_totals:=jsonb_set(v_totals,array[v_i::text],to_jsonb(coalesce((v_totals->>v_i::text)::numeric,0)+v_qty),true);
  end loop;
  return v_totals;
end;
$$;

create or replace function public.create_customer_invoice(p_company_id uuid,p_ddt_id uuid,p_request_id uuid,p_expected_ddt jsonb,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); d public.ddt%rowtype; o public.ordini_cliente%rowtype;
 f public.fatture_cliente%rowtype; op public.customer_invoice_operations%rowtype;
 order_id uuid; snapshot jsonb; r jsonb; source jsonb; totals jsonb:='{}'::jsonb; rows_out jsonb:='[]'::jsonb;
 idx integer; matches integer; q numeric; total numeric; ids jsonb; result jsonb;
 invoice_date date; invoice_num text; number_parts text[];
begin
 if actor is null or p_company_id is null or p_ddt_id is null or p_request_id is null then raise exception 'accesso e identificativi richiesti'; end if;
 perform 1 from public.memberships where company_id=p_company_id and user_id=actor and role in ('admin','operatore') for share;
 if not found then raise exception 'operazione non autorizzata'; end if;
 if jsonb_typeof(p_expected_ddt) is distinct from 'object' or jsonb_typeof(p_document) is distinct from 'object' then raise exception 'snapshot o documento non valido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('customer-invoice:'||p_company_id::text||':'||p_request_id::text,0));
 select * into op from public.customer_invoice_operations where company_id=p_company_id and request_id=p_request_id;
 if found then
  if op.actor_id<>actor or op.ddt_id<>p_ddt_id or op.expected_ddt is distinct from p_expected_ddt or op.document is distinct from p_document then raise exception 'identificativo operazione già utilizzato con dati diversi'; end if;
  return op.result || '{"replayed":true}'::jsonb;
 end if;
 select oc_id into order_id from public.ddt where id=p_ddt_id and company_id=p_company_id;
 if not found then raise exception 'DDT non disponibile'; end if;
 -- Same order-first lock order as delivery creation/lifecycle. Recheck after locking DDT.
 if order_id is not null then
  select * into o from public.ordini_cliente where id=order_id and company_id=p_company_id for update;
  if not found then raise exception 'ordine non disponibile'; end if;
 end if;
 select * into d from public.ddt where id=p_ddt_id and company_id=p_company_id for update;
 if not found or d.oc_id is distinct from order_id then raise exception 'DDT modificato: ricaricare'; end if;
 if d.extra->'annullato'='true'::jsonb then raise exception 'DDT annullato'; end if;
 if nullif(d.extra->>'ftId','') is not null or exists(select 1 from public.fatture_cliente where company_id=p_company_id and ddt_id=d.id) then raise exception 'DDT già fatturato'; end if;
 snapshot:=jsonb_build_object('cliente_id',d.cliente_id,'oc_id',d.oc_id,'righe',d.righe,'extra',jsonb_build_object('ftId',coalesce(d.extra->'ftId','null'::jsonb),'annullato',coalesce(d.extra->'annullato'='true'::jsonb,false)));
 if snapshot is distinct from p_expected_ddt then raise exception 'DDT modificato: ricaricare'; end if;
 if p_document->>'cliente_id' is distinct from d.cliente_id::text or (p_document->>'oc_id') is distinct from d.oc_id::text then raise exception 'cliente o ordine non corrispondente al DDT'; end if;
 perform 1 from public.clienti where id=d.cliente_id and company_id=p_company_id for share;
 if not found or (order_id is not null and o.cliente_id<>d.cliente_id) then raise exception 'cliente non coerente'; end if;
 if jsonb_typeof(p_document->'data') is distinct from 'string' or (p_document->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'data fattura non valida'; end if;
 invoice_date:=(p_document->>'data')::date;
 if p_document ? 'num' and jsonb_typeof(p_document->'num') not in ('string','null') then raise exception 'numero non valido'; end if;
 if p_document ? 'dest_id' and jsonb_typeof(p_document->'dest_id') not in ('string','null') then raise exception 'destinazione non valida'; end if;
 if jsonb_typeof(d.righe) is distinct from 'array' or jsonb_array_length(d.righe)=0 or jsonb_typeof(p_document->'righe') is distinct from 'array' or jsonb_array_length(p_document->'righe')=0 then raise exception 'righe richieste'; end if;
 for r in select value from jsonb_array_elements(p_document->'righe') loop
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'qty') is distinct from 'number' then raise exception 'quantità non valida'; end if;
  q:=(r->>'qty')::numeric; if q<=0 then raise exception 'quantità positiva richiesta'; end if;
  if r ? 'source_ddt_index' then
   if jsonb_typeof(r->'source_ddt_index') is distinct from 'number' then raise exception 'indice non valido'; end if;
   if (r->>'source_ddt_index')::numeric<>trunc((r->>'source_ddt_index')::numeric) or (r->>'source_ddt_index')::numeric<0 or (r->>'source_ddt_index')::numeric>=jsonb_array_length(d.righe) then raise exception 'indice fuori intervallo'; end if;
   idx:=(r->>'source_ddt_index')::integer;
  else
   select count(*),min(ordinality)::integer-1 into matches,idx from jsonb_array_elements(d.righe) with ordinality where value->>'cod'=r->>'cod';
   if matches<>1 then raise exception 'riga DDT ambigua: specificare source_ddt_index'; end if;
  end if;
  source:=d.righe->idx;
  if jsonb_typeof(r->'cod') is distinct from 'string' or r->>'cod' is distinct from source->>'cod' then raise exception 'codice non corrispondente'; end if;
  if jsonb_typeof(source->'qty') is distinct from 'number' or (source->>'qty')::numeric<=0 then raise exception 'quantità DDT non valida'; end if;
  total:=coalesce((totals->>idx::text)::numeric,0)+q;
  totals:=jsonb_set(totals,array[idx::text],to_jsonb(total),true);
  rows_out:=rows_out||jsonb_build_array(r||jsonb_build_object('source_ddt_index',idx));
 end loop;
 for quantity_check_index in 0..jsonb_array_length(d.righe)-1 loop
  if coalesce((totals->>quantity_check_index::text)::numeric,0) is distinct from (d.righe->quantity_check_index->>'qty')::numeric then raise exception 'fatturare tutte le quantità del DDT esattamente'; end if;
 end loop;
 invoice_num:=nullif(trim(p_document->>'num'),'');
 if invoice_num is null then invoice_num:=public.next_document_number(p_company_id,'FT',extract(year from invoice_date)::integer);
 else
  number_parts:=regexp_match(invoice_num,'^FT/([0-9]{4})/([0-9]+)$');
  if number_parts is not null then perform public.bump_document_counter(p_company_id,'FT',number_parts[1]::integer,number_parts[2]::integer+1); end if;
 end if;
 insert into public.fatture_cliente(company_id,num,data,cliente_id,ddt_id,oc_id,dest_id,righe)
 values(p_company_id,invoice_num,invoice_date,d.cliente_id,d.id,d.oc_id,p_document->>'dest_id',rows_out) returning * into f;
 update public.ddt set extra=extra||jsonb_build_object('ftId',f.num) where id=d.id returning * into d;
 if order_id is not null then
  ids:=coalesce(o.extra->'ftIds','[]'::jsonb); if jsonb_typeof(ids) is distinct from 'array' then raise exception 'collegamenti fatture ordine non validi'; end if;
  if not ids @> jsonb_build_array(f.num) then ids:=ids||jsonb_build_array(f.num); end if;
  update public.ordini_cliente set extra=extra||jsonb_build_object('ftId',f.num,'ftIds',ids) where id=o.id returning * into o;
 end if;
 result:=jsonb_build_object('fattura',to_jsonb(f),'ddt',to_jsonb(d),'ordine',case when order_id is null then null else to_jsonb(o) end,'replayed',false);
 insert into public.customer_invoice_operations values(p_company_id,p_request_id,actor,d.id,p_expected_ddt,p_document,result,now());
 return result;
end;
$$;

create or replace function public.initialize_document_usage(p_company_id uuid,p_month date)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_used bigint; v_start timestamptz; v_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('document-quota:'||p_company_id::text||':'||p_month::text,0));
  select u.used into v_used from public.document_monthly_usage u where u.company_id=p_company_id and u.month_start=p_month;
  if found then return v_used; end if;
  v_start:=p_month::timestamp at time zone 'UTC';
  v_end:=(p_month+interval '1 month')::timestamp at time zone 'UTC';
  select sum(document_counts.n)::bigint into v_used from (
    select count(*)::bigint as n from public.preventivi where company_id=p_company_id and created_at>=v_start and created_at<v_end
    union all
    select count(*)::bigint as n from public.ordini_cliente where company_id=p_company_id and created_at>=v_start and created_at<v_end
    union all
    select count(*)::bigint as n from public.ordini_fornitore where company_id=p_company_id and created_at>=v_start and created_at<v_end
    union all
    select count(*)::bigint as n from public.ddt where company_id=p_company_id and created_at>=v_start and created_at<v_end
    union all
    select count(*)::bigint as n from public.fatture_cliente where company_id=p_company_id and created_at>=v_start and created_at<v_end
    union all
    select count(*)::bigint as n from public.fatture_fornitore where company_id=p_company_id and created_at>=v_start and created_at<v_end
    union all
    select count(*)::bigint as n from public.note_credito where company_id=p_company_id and created_at>=v_start and created_at<v_end
    union all
    select count(*)::bigint as n from public.note_credito_fornitore where company_id=p_company_id and created_at>=v_start and created_at<v_end
    union all
    select count(*)::bigint as n from public.ddt_fornitore where company_id=p_company_id and created_at>=v_start and created_at<v_end
  ) as document_counts;
  insert into public.document_monthly_usage(company_id,month_start,used) values(p_company_id,p_month,v_used);
  return v_used;
end;
$$;

notify pgrst,'reload schema';
