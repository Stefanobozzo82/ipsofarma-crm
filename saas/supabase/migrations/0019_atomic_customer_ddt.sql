-- Atomic creation only: existing document editing paths remain separate.
-- Private replay records are not writable/readable through the client API.
create table public.customer_ddt_operations (
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  order_id uuid not null,
  expected_rows jsonb not null,
  document jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company_id, request_id)
);
alter table public.customer_ddt_operations enable row level security;
revoke all on public.customer_ddt_operations from public, anon, authenticated;

-- lpad(text,4) truncates 10000 to 1000. Retain minimum width, never truncate.
create or replace function public.next_document_number(p_company_id uuid, p_doc_type text, p_anno int)
returns text language plpgsql security definer set search_path = '' as $$
declare v_next integer;
begin
  if not public.is_member(p_company_id) or public.is_viewer_only(p_company_id) then
    raise exception 'utente non autorizzato a generare documenti';
  end if;
  insert into public.document_counters(company_id, doc_type, anno, next_value)
    values(p_company_id, p_doc_type, p_anno, 2)
    on conflict(company_id, doc_type, anno) do update
      set next_value = public.document_counters.next_value + 1
    returning next_value - 1 into v_next;
  return p_doc_type || '/' || p_anno || '/' || lpad(v_next::text, greatest(4,length(v_next::text)), '0');
end;
$$;

create or replace function public.create_customer_ddt(
  p_company_id uuid, p_order_id uuid, p_request_id uuid,
  p_expected_rows jsonb, p_document jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_order public.ordini_cliente%rowtype;
  v_ddt public.ddt%rowtype;
  v_operation public.customer_ddt_operations%rowtype;
  v_row jsonb;
  v_source jsonb;
  v_rows jsonb;
  v_deliveries jsonb := '[]'::jsonb;
  v_totals jsonb := '{}'::jsonb;
  v_extra jsonb;
  v_ids jsonb;
  v_result jsonb;
  v_index integer;
  v_count integer;
  v_quantity numeric;
  v_ordered numeric;
  v_delivered numeric;
  v_total numeric;
  v_date date;
  v_num text;
  v_match text[];
begin
  if v_actor is null or p_company_id is null or p_order_id is null or p_request_id is null then
    raise exception 'accesso e identificativi operazione richiesti';
  end if;
  -- Hold the permission row through commit, preventing a concurrent revocation.
  perform 1 from public.memberships
    where company_id=p_company_id and user_id=v_actor and role in ('admin','operatore')
    for share;
  if not found then raise exception 'operazione non autorizzata per questa azienda'; end if;
  if jsonb_typeof(p_expected_rows) is distinct from 'array'
    or jsonb_typeof(p_document) is distinct from 'object' then
    raise exception 'snapshot ordine o documento non valido';
  end if;
  -- Same request serializes even if submitted concurrently for different orders.
  perform pg_advisory_xact_lock(hashtextextended('customer-ddt:' || p_company_id::text || ':' || p_request_id::text, 0));
  select * into v_operation from public.customer_ddt_operations
    where company_id=p_company_id and request_id=p_request_id;
  if found then
    if v_operation.actor_id <> v_actor or v_operation.order_id <> p_order_id
      or v_operation.expected_rows is distinct from p_expected_rows
      or v_operation.document is distinct from p_document then
      raise exception 'identificativo operazione già utilizzato con dati diversi';
    end if;
    return v_operation.result || '{"replayed":true}'::jsonb;
  end if;

  select * into v_order from public.ordini_cliente
    where id=p_order_id and company_id=p_company_id for update;
  if not found then raise exception 'ordine non disponibile per questa azienda'; end if;
  if v_order.righe is distinct from p_expected_rows then
    raise exception 'ordine modificato: ricaricare prima di creare il DDT';
  end if;
  if jsonb_typeof(p_document->'cliente_id') is distinct from 'string'
    or p_document->>'cliente_id' <> v_order.cliente_id::text then
    raise exception 'cliente del DDT non corrispondente all''ordine';
  end if;
  perform 1 from public.clienti where id=v_order.cliente_id and company_id=p_company_id for share;
  if not found then raise exception 'cliente non disponibile per questa azienda'; end if;
  if jsonb_typeof(p_document->'data') is distinct from 'string'
    or (p_document->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'data DDT non valida';
  end if;
  v_date := (p_document->>'data')::date;
  if p_document ? 'num' and jsonb_typeof(p_document->'num') not in ('string','null') then
    raise exception 'numero DDT non valido';
  end if;
  if p_document ? 'dest_id' and jsonb_typeof(p_document->'dest_id') not in ('string','null') then
    raise exception 'destinazione DDT non valida';
  end if;
  if jsonb_typeof(p_document->'righe') is distinct from 'array'
    or jsonb_array_length(p_document->'righe')=0 then
    raise exception 'almeno una riga DDT richiesta';
  end if;

  for v_row in select value from jsonb_array_elements(p_document->'righe') loop
    if jsonb_typeof(v_row) is distinct from 'object'
      or jsonb_typeof(v_row->'qty') is distinct from 'number' then
      raise exception 'riga DDT o quantità non valida';
    end if;
    v_quantity := (v_row->>'qty')::numeric;
    if v_quantity <= 0 then raise exception 'la quantità consegnata deve essere positiva'; end if;
    if v_row ? 'source_order_index' then
      if jsonb_typeof(v_row->'source_order_index') is distinct from 'number' then
        raise exception 'indice riga ordine non valido';
      end if;
      if (v_row->>'source_order_index')::numeric <> trunc((v_row->>'source_order_index')::numeric)
        or (v_row->>'source_order_index')::numeric < 0
        or (v_row->>'source_order_index')::numeric >= jsonb_array_length(v_order.righe) then
        raise exception 'indice riga ordine fuori intervallo';
      end if;
      v_index := (v_row->>'source_order_index')::numeric::integer;
    else
      select count(*), min(ordinality)::integer-1 into v_count,v_index
        from jsonb_array_elements(v_order.righe) with ordinality
        where value->>'cod' = v_row->>'cod';
      if v_count <> 1 then raise exception 'riga ordine ambigua: ricrea il DDT dal pulsante dell''ordine'; end if;
    end if;
    v_source := v_order.righe->v_index;
    if jsonb_typeof(v_row->'cod') is distinct from 'string'
      or v_row->>'cod' is distinct from v_source->>'cod' then
      raise exception 'codice DDT non corrispondente alla riga ordine';
    end if;
    if jsonb_typeof(v_source->'qty') is distinct from 'number'
      or (v_source ? 'qtyEv' and jsonb_typeof(v_source->'qtyEv') not in ('number','null')) then
      raise exception 'quantità ordine non valida: verificare i dati';
    end if;
    v_ordered := (v_source->>'qty')::numeric;
    v_delivered := coalesce((v_source->>'qtyEv')::numeric,0);
    v_total := coalesce((v_totals->>v_index::text)::numeric,0) + v_quantity;
    if v_ordered < 0 or v_delivered < 0 or v_total > v_ordered-v_delivered then
      raise exception 'quantità DDT superiore al residuo della riga ordine';
    end if;
    v_totals := jsonb_set(v_totals,array[v_index::text],to_jsonb(v_total),true);
    v_deliveries := v_deliveries || jsonb_build_array(v_row || jsonb_build_object('source_order_index',v_index));
  end loop;
  v_rows := v_order.righe;
  for v_index in select key::integer from jsonb_each(v_totals) loop
    v_source := v_rows->v_index;
    v_delivered := coalesce((v_source->>'qtyEv')::numeric,0) + (v_totals->>v_index::text)::numeric;
    v_rows := jsonb_set(v_rows,array[v_index::text],v_source || jsonb_build_object('qtyEv',v_delivered));
  end loop;
  v_extra := v_order.extra;
  if jsonb_typeof(v_extra) is distinct from 'object' then raise exception 'metadati ordine non validi'; end if;
  v_ids := coalesce(nullif(v_extra->'ddtIds','null'::jsonb),'[]'::jsonb);
  if jsonb_typeof(v_ids) is distinct from 'array' then raise exception 'collegamenti DDT ordine non validi'; end if;
  if jsonb_typeof(v_extra->'ddtId') = 'string'
    and trim(v_extra->>'ddtId') <> ''
    and not v_ids @> jsonb_build_array(v_extra->>'ddtId') then
    v_ids := v_ids || jsonb_build_array(v_extra->>'ddtId');
  end if;

  v_num := nullif(trim(p_document->>'num'),'');
  if v_num is null then
    v_num := public.next_document_number(p_company_id,'DDT',extract(year from v_date)::integer);
  else
    v_match := regexp_match(v_num,'^DDT/([0-9]{4})/([0-9]+)$');
    if v_match is not null then
      perform public.bump_document_counter(p_company_id,'DDT',v_match[1]::integer,v_match[2]::integer+1);
    end if;
  end if;
  insert into public.ddt(company_id,num,data,cliente_id,oc_id,dest_id,righe)
    values(p_company_id,v_num,v_date,v_order.cliente_id,v_order.id,
      case when p_document ? 'dest_id' then p_document->>'dest_id' else v_order.dest_id end,v_deliveries)
    returning * into v_ddt;
  if not v_ids @> jsonb_build_array(v_num) then v_ids := v_ids || jsonb_build_array(v_num); end if;
  update public.ordini_cliente set righe=v_rows,
    extra=v_extra || jsonb_build_object('ddtIds',v_ids,'ddtId',v_num)
    where id=v_order.id and company_id=p_company_id returning * into v_order;
  v_result := jsonb_build_object('ddt',to_jsonb(v_ddt),'ordine',to_jsonb(v_order),'replayed',false);
  insert into public.customer_ddt_operations(company_id,request_id,actor_id,order_id,expected_rows,document,result)
    values(p_company_id,p_request_id,v_actor,p_order_id,p_expected_rows,p_document,v_result);
  return v_result;
end;
$$;
revoke all on function public.create_customer_ddt(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_customer_ddt(uuid,uuid,uuid,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
