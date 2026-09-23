-- Corrections are supported only where a creation record proves the quantities.
-- Historical deliveries are never guessed from product codes or reconstructed en masse.
create table public.customer_ddt_changes (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null, actor_id uuid not null, ddt_id uuid not null,
  action text not null check(action in ('update','cancel')),
  expected jsonb not null, document jsonb not null, reason text not null,
  result jsonb not null, created_at timestamptz not null default now(),
  unique(company_id,request_id)
);
create index on public.customer_ddt_changes(company_id,ddt_id,id desc);
alter table public.customer_ddt_changes enable row level security;
revoke all on public.customer_ddt_changes from public,anon,authenticated;
revoke all on sequence public.customer_ddt_changes_id_seq from public,anon,authenticated;

create function public.customer_ddt_quantities(p_rows jsonb,p_order_rows jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare v_row jsonb; v_i integer; v_qty numeric; v_totals jsonb:='{}';
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
revoke all on function public.customer_ddt_quantities(jsonb,jsonb) from public,anon,authenticated;

create function public.change_customer_ddt(
  p_company_id uuid,p_ddt_id uuid,p_request_id uuid,p_action text,
  p_expected jsonb,p_document jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_role text; v_ddt public.ddt%rowtype;
  v_order public.ordini_cliente%rowtype; v_order_id uuid;
  v_prior public.customer_ddt_changes%rowtype;
  v_creation public.customer_ddt_operations%rowtype;
  v_authoritative jsonb; v_snapshot jsonb; v_result jsonb; v_rows jsonb;
  v_before jsonb; v_after jsonb; v_i integer; v_key text; v_ev numeric; v_qty numeric;
  v_new_rows jsonb; v_new_extra jsonb; v_date date; v_row jsonb;
begin
  if v_actor is null or p_company_id is null or p_ddt_id is null or p_request_id is null then
    raise exception 'accesso e identificativi richiesti';
  end if;
  select role into v_role from public.memberships
    where company_id=p_company_id and user_id=v_actor for share;
  if v_role is null or v_role not in ('admin','operatore') or (p_action='cancel' and v_role<>'admin') then
    raise exception 'operazione non autorizzata';
  end if;
  if p_action is null or p_action not in ('update','cancel')
    or jsonb_typeof(p_expected) is distinct from 'object'
    or jsonb_typeof(p_document) is distinct from 'object' then raise exception 'richiesta non valida'; end if;
  if p_reason is null or length(p_reason)>1000 or (p_action='cancel' and length(trim(p_reason))<3) then
    raise exception 'specificare un motivo di annullamento (3–1000 caratteri)';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-ddt-change:'||p_company_id||':'||p_request_id,0));
  select * into v_prior from public.customer_ddt_changes where company_id=p_company_id and request_id=p_request_id;
  if found then
    if v_prior.actor_id<>v_actor or v_prior.ddt_id<>p_ddt_id or v_prior.action<>p_action
      or v_prior.expected is distinct from p_expected or v_prior.document is distinct from p_document
      or v_prior.reason is distinct from p_reason then raise exception 'identificativo operazione già utilizzato'; end if;
    return v_prior.result||'{"replayed":true}'::jsonb;
  end if;
  -- All lifecycle functions lock order before DDT; recheck its identity afterwards.
  select oc_id into v_order_id from public.ddt where id=p_ddt_id and company_id=p_company_id;
  if not found then raise exception 'DDT non disponibile'; end if;
  if v_order_id is not null then
    select * into v_order from public.ordini_cliente where id=v_order_id and company_id=p_company_id for update;
    if not found then raise exception 'ordine non disponibile'; end if;
  end if;
  select * into v_ddt from public.ddt where id=p_ddt_id and company_id=p_company_id for update;
  if not found or v_ddt.oc_id is distinct from v_order_id then raise exception 'DDT modificato: ricaricare'; end if;
  v_snapshot:=jsonb_build_object('num',v_ddt.num,'data',v_ddt.data,'cliente_id',v_ddt.cliente_id,
    'oc_id',v_ddt.oc_id,'dest_id',v_ddt.dest_id,'righe',v_ddt.righe,'extra',v_ddt.extra);
  if v_snapshot is distinct from p_expected then raise exception 'DDT modificato: ricaricare'; end if;
  if v_ddt.extra->>'annullato'='true' then raise exception 'DDT già annullato'; end if;
  if coalesce(v_ddt.extra->>'ftId','')<>'' or exists(select 1 from public.fatture_cliente where company_id=p_company_id and ddt_id=p_ddt_id) then
    raise exception 'DDT fatturato: rettificare prima la fatturazione';
  end if;
  if p_action='update' then
    -- Number and source/customer identity cannot change after issue.
    if p_document->>'num' is distinct from v_ddt.num
      or p_document->>'cliente_id' is distinct from v_ddt.cliente_id::text
      or p_document->>'oc_id' is distinct from v_ddt.oc_id::text
      or p_document->'extra' is distinct from v_ddt.extra then
      raise exception 'numero, cliente, ordine e metadati del DDT non sono modificabili';
    end if;
    if jsonb_typeof(p_document->'data') is distinct from 'string'
      or p_document->>'data' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(p_document->'righe') is distinct from 'array'
      or jsonb_array_length(p_document->'righe')=0 then raise exception 'data o righe non valide'; end if;
    v_date:=(p_document->>'data')::date;
    v_new_rows:=p_document->'righe'; v_new_extra:=v_ddt.extra;
    if p_document ? 'dest_id' and jsonb_typeof(p_document->'dest_id') not in ('string','null') then
      raise exception 'destinazione non valida';
    end if;
    for v_row in select value from jsonb_array_elements(v_new_rows) loop
      if jsonb_typeof(v_row->'qty') is distinct from 'number' or (v_row->>'qty')::numeric<=0 then
        raise exception 'quantità non valida';
      end if;
    end loop;
  else
    v_date:=v_ddt.data; v_new_rows:=v_ddt.righe;
    v_new_extra:=v_ddt.extra||jsonb_build_object('annullato',true,'annullato_at',now(),
      'annullato_by',v_actor,'motivo_annullamento',trim(p_reason));
  end if;
  if v_order_id is not null then
    select * into v_creation from public.customer_ddt_operations
      where company_id=p_company_id and result->'ddt'->>'id'=p_ddt_id::text;
    if not found or v_creation.order_id<>v_order_id then
      raise exception 'DDT storico: riconciliazione delle quantità necessaria prima della rettifica';
    end if;
    select result->'ddt' into v_authoritative from public.customer_ddt_changes
      where company_id=p_company_id and ddt_id=p_ddt_id order by id desc limit 1;
    v_authoritative:=coalesce(v_authoritative,v_creation.result->'ddt');
    if v_authoritative->'righe' is distinct from v_ddt.righe then
      raise exception 'DDT alterato fuori dal flusso tracciato: riconciliazione necessaria';
    end if;
    v_before:=public.customer_ddt_quantities(v_ddt.righe,v_order.righe);
    v_after:=case when p_action='cancel' then '{}'::jsonb else public.customer_ddt_quantities(v_new_rows,v_order.righe) end;
    v_rows:=v_order.righe;
    for v_key in select key from jsonb_each(v_before||v_after) loop
      v_i:=v_key::integer;
      v_ev:=coalesce((v_rows->v_i->>'qtyEv')::numeric,0)-(coalesce(v_before->>v_key,'0'))::numeric
        +(coalesce(v_after->>v_key,'0'))::numeric;
      v_qty:=(v_rows->v_i->>'qty')::numeric;
      if v_ev<0 or v_ev>v_qty then raise exception 'quantità ordine incoerenti: ricaricare e verificare'; end if;
      v_rows:=jsonb_set(v_rows,array[v_key,'qtyEv'],to_jsonb(v_ev),true);
    end loop;
    update public.ordini_cliente set righe=v_rows where id=v_order_id and company_id=p_company_id returning * into v_order;
  end if;
  update public.ddt set data=v_date,righe=v_new_rows,extra=v_new_extra,
    dest_id=case when p_action='update' then p_document->>'dest_id' else v_ddt.dest_id end
    where id=p_ddt_id and company_id=p_company_id returning * into v_ddt;
  v_result:=jsonb_build_object('ddt',to_jsonb(v_ddt),'ordine',case when v_order_id is null then null else to_jsonb(v_order) end,'replayed',false);
  insert into public.customer_ddt_changes(company_id,request_id,actor_id,ddt_id,action,expected,document,reason,result)
    values(p_company_id,p_request_id,v_actor,p_ddt_id,p_action,p_expected,p_document,p_reason,v_result);
  return v_result;
end;
$$;
revoke all on function public.change_customer_ddt(uuid,uuid,uuid,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.change_customer_ddt(uuid,uuid,uuid,text,jsonb,jsonb,text) to authenticated;

-- Invoker trigger: a normal PostgREST writer cannot bypass quantity correction.
-- SECURITY DEFINER domain RPCs execute as their owner and are permitted.
create function public.guard_customer_ddt_direct_write() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    if TG_OP='DELETE' then raise exception 'usare annullamento tracciato del DDT'; end if;
    if TG_OP='INSERT' then
      if new.oc_id is not null then raise exception 'usare la creazione transazionale del DDT'; end if;
      return new;
    end if;
    if old.oc_id is not null or new.oc_id is not null or old.extra->>'annullato'='true' then
      raise exception 'usare la rettifica transazionale del DDT';
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger customer_ddt_direct_write before insert or update or delete on public.ddt
for each row execute function public.guard_customer_ddt_direct_write();
create function public.guard_customer_order_delete() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and (
    exists(select 1 from public.ddt where company_id=old.company_id and oc_id=old.id)
    or exists(select 1 from public.fatture_cliente where company_id=old.company_id and oc_id=old.id)
  ) then raise exception 'ordine con documenti collegati: cancellazione non consentita'; end if;
  return old;
end;
$$;
create trigger customer_order_delete before delete on public.ordini_cliente
for each row execute function public.guard_customer_order_delete();
notify pgrst,'reload schema';
