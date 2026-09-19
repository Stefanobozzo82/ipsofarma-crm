-- Atomic creation only: existing document editing paths remain separate.
-- Private replay records are not writable/readable through the client API.
create table public.supplier_ddt_operations (
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
alter table public.supplier_ddt_operations enable row level security;
revoke all on public.supplier_ddt_operations from public, anon, authenticated;

create or replace function public.create_supplier_ddt(
  p_company_id uuid, p_order_id uuid, p_request_id uuid,
  p_expected_rows jsonb, p_document jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_order public.ordini_fornitore%rowtype;
  v_ddt public.ddt_fornitore%rowtype;
  v_invoice public.fatture_fornitore%rowtype;
  v_operation public.supplier_ddt_operations%rowtype;
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
  perform pg_advisory_xact_lock(hashtextextended('supplier-ddt:' || p_company_id::text || ':' || p_request_id::text, 0));
  select * into v_operation from public.supplier_ddt_operations
    where company_id=p_company_id and request_id=p_request_id;
  if found then
    if v_operation.actor_id <> v_actor or v_operation.order_id <> p_order_id
      or v_operation.expected_rows is distinct from p_expected_rows
      or v_operation.document is distinct from p_document then
      raise exception 'identificativo operazione già utilizzato con dati diversi';
    end if;
    return v_operation.result || '{"replayed":true}'::jsonb;
  end if;

  select * into v_order from public.ordini_fornitore
    where id=p_order_id and company_id=p_company_id for update;
  if not found then raise exception 'ordine non disponibile per questa azienda'; end if;
  if v_order.righe is distinct from p_expected_rows then
    raise exception 'ordine modificato: ricaricare prima di creare il DDT';
  end if;
  if jsonb_typeof(p_document->'fornitore_id') is distinct from 'string'
    or p_document->>'fornitore_id' <> v_order.fornitore_id::text then
    raise exception 'fornitore del DDT non corrispondente all''ordine';
  end if;
  perform 1 from public.fornitori where id=v_order.fornitore_id and company_id=p_company_id for share;
  if not found then raise exception 'fornitore non disponibile per questa azienda'; end if;
  if jsonb_typeof(p_document->'data') is distinct from 'string'
    or (p_document->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'data DDT non valida';
  end if;
  v_date := (p_document->>'data')::date;
  if p_document ? 'num' and jsonb_typeof(p_document->'num') not in ('string','null') then
    raise exception 'numero DDT non valido';
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
      if v_count <> 1 then raise exception 'riga ordine ambigua: svuota le righe e seleziona di nuovo l''ordine'; end if;
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
  v_ids := coalesce(nullif(v_extra->'ddtfIds','null'::jsonb),'[]'::jsonb);
  if jsonb_typeof(v_ids) is distinct from 'array' then raise exception 'collegamenti DDT ordine non validi'; end if;
  if jsonb_typeof(v_extra->'ddtfId') = 'string'
    and trim(v_extra->>'ddtfId') <> ''
    and not v_ids @> jsonb_build_array(v_extra->>'ddtfId') then
    v_ids := v_ids || jsonb_build_array(v_extra->>'ddtfId');
  end if;

  v_num := nullif(trim(p_document->>'num'),'');
  if v_num is null then
    v_num := public.next_document_number(p_company_id,'DDTF',extract(year from v_date)::integer);
  else
    v_match := regexp_match(v_num,'^DDTF/([0-9]{4})/([0-9]+)$');
    if v_match is not null then
      perform public.bump_document_counter(p_company_id,'DDTF',v_match[1]::integer,v_match[2]::integer+1);
    end if;
  end if;
  if nullif(p_document->>'fattura_id','') is not null then
    select * into v_invoice from public.fatture_fornitore
      where id=(p_document->>'fattura_id')::uuid and company_id=p_company_id for update;
    if not found or v_invoice.fornitore_id<>v_order.fornitore_id or v_invoice.ddtf_id is not null
      or (v_invoice.of_id is not null and v_invoice.of_id<>v_order.id) then
      raise exception 'fattura non disponibile per il collegamento a questo DDT';
    end if;
  end if;
  insert into public.ddt_fornitore(company_id,num,data,fornitore_id,of_id,righe)
    values(p_company_id,v_num,v_date,v_order.fornitore_id,v_order.id,v_deliveries)
    returning * into v_ddt;
  if v_invoice.id is not null then
    update public.fatture_fornitore set ddtf_id=v_ddt.id where id=v_invoice.id returning * into v_invoice;
    update public.ddt_fornitore set extra=extra||jsonb_build_object('ftfId',v_invoice.num) where id=v_ddt.id returning * into v_ddt;
  end if;
  if not v_ids @> jsonb_build_array(v_num) then v_ids := v_ids || jsonb_build_array(v_num); end if;
  update public.ordini_fornitore set righe=v_rows,
    extra=v_extra || jsonb_build_object('ddtfIds',v_ids,'ddtfId',v_num)
    where id=v_order.id and company_id=p_company_id returning * into v_order;
  v_result := jsonb_build_object('ddt',to_jsonb(v_ddt),'ordine',to_jsonb(v_order),'fattura',case when v_invoice.id is null then null else to_jsonb(v_invoice) end,'replayed',false);
  insert into public.supplier_ddt_operations(company_id,request_id,actor_id,order_id,expected_rows,document,result)
    values(p_company_id,p_request_id,v_actor,p_order_id,p_expected_rows,p_document,v_result);
  return v_result;
end;
$$;
revoke all on function public.create_supplier_ddt(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_supplier_ddt(uuid,uuid,uuid,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
-- Corrections are supported only where a creation record proves the quantities.
-- Historical deliveries are never guessed from product codes or reconstructed en masse.
create table public.supplier_ddt_changes (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null, actor_id uuid not null, ddt_id uuid not null,
  action text not null check(action in ('update','cancel')),
  expected jsonb not null, document jsonb not null, reason text not null,
  result jsonb not null, created_at timestamptz not null default now(),
  unique(company_id,request_id)
);
create index on public.supplier_ddt_changes(company_id,ddt_id,id desc);
alter table public.supplier_ddt_changes enable row level security;
revoke all on public.supplier_ddt_changes from public,anon,authenticated;
revoke all on sequence public.supplier_ddt_changes_id_seq from public,anon,authenticated;

create function public.supplier_ddt_quantities(p_rows jsonb,p_order_rows jsonb)
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
revoke all on function public.supplier_ddt_quantities(jsonb,jsonb) from public,anon,authenticated;

create function public.change_supplier_ddt(
  p_company_id uuid,p_ddt_id uuid,p_request_id uuid,p_action text,
  p_expected jsonb,p_document jsonb,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid(); v_role text; v_ddt public.ddt_fornitore%rowtype;
  v_order public.ordini_fornitore%rowtype; v_order_id uuid;
  v_prior public.supplier_ddt_changes%rowtype;
  v_creation public.supplier_ddt_operations%rowtype;
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
  perform pg_advisory_xact_lock(hashtextextended('supplier-ddt-change:'||p_company_id||':'||p_request_id,0));
  select * into v_prior from public.supplier_ddt_changes where company_id=p_company_id and request_id=p_request_id;
  if found then
    if v_prior.actor_id<>v_actor or v_prior.ddt_id<>p_ddt_id or v_prior.action<>p_action
      or v_prior.expected is distinct from p_expected or v_prior.document is distinct from p_document
      or v_prior.reason is distinct from p_reason then raise exception 'identificativo operazione già utilizzato'; end if;
    return v_prior.result||'{"replayed":true}'::jsonb;
  end if;
  -- All lifecycle functions lock order before DDT; recheck its identity afterwards.
  select of_id into v_order_id from public.ddt_fornitore where id=p_ddt_id and company_id=p_company_id;
  if not found then raise exception 'DDT non disponibile'; end if;
  if v_order_id is not null then
    select * into v_order from public.ordini_fornitore where id=v_order_id and company_id=p_company_id for update;
    if not found then raise exception 'ordine non disponibile'; end if;
  end if;
  select * into v_ddt from public.ddt_fornitore where id=p_ddt_id and company_id=p_company_id for update;
  if not found or v_ddt.of_id is distinct from v_order_id then raise exception 'DDT modificato: ricaricare'; end if;
  v_snapshot:=jsonb_build_object('num',v_ddt.num,'data',v_ddt.data,'fornitore_id',v_ddt.fornitore_id,
    'of_id',v_ddt.of_id,'righe',v_ddt.righe,'extra',v_ddt.extra);
  if v_snapshot is distinct from p_expected then raise exception 'DDT modificato: ricaricare'; end if;
  if v_ddt.extra->>'annullato'='true' then raise exception 'DDT già annullato'; end if;
  if coalesce(v_ddt.extra->>'ftfId','')<>'' or exists(select 1 from public.fatture_fornitore where company_id=p_company_id and ddtf_id=p_ddt_id) then
    raise exception 'DDT fatturato: rettificare prima la fatturazione';
  end if;
  if p_action='update' then
    -- Number and source/customer identity cannot change after issue.
    if p_document->>'num' is distinct from v_ddt.num
      or p_document->>'fornitore_id' is distinct from v_ddt.fornitore_id::text
      or p_document->>'of_id' is distinct from v_ddt.of_id::text
      or p_document->'extra' is distinct from v_ddt.extra then
      raise exception 'numero, fornitore, ordine e metadati del DDT non sono modificabili';
    end if;
    if jsonb_typeof(p_document->'data') is distinct from 'string'
      or p_document->>'data' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(p_document->'righe') is distinct from 'array'
      or jsonb_array_length(p_document->'righe')=0 then raise exception 'data o righe non valide'; end if;
    v_date:=(p_document->>'data')::date;
    v_new_rows:=p_document->'righe'; v_new_extra:=v_ddt.extra;
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
    select * into v_creation from public.supplier_ddt_operations
      where company_id=p_company_id and result->'ddt'->>'id'=p_ddt_id::text;
    if not found or v_creation.order_id<>v_order_id then
      raise exception 'DDT storico: riconciliazione delle quantità necessaria prima della rettifica';
    end if;
    select result->'ddt' into v_authoritative from public.supplier_ddt_changes
      where company_id=p_company_id and ddt_id=p_ddt_id order by id desc limit 1;
    v_authoritative:=coalesce(v_authoritative,v_creation.result->'ddt');
    if v_authoritative->'righe' is distinct from v_ddt.righe then
      raise exception 'DDT alterato fuori dal flusso tracciato: riconciliazione necessaria';
    end if;
    v_before:=public.supplier_ddt_quantities(v_ddt.righe,v_order.righe);
    v_after:=case when p_action='cancel' then '{}'::jsonb else public.supplier_ddt_quantities(v_new_rows,v_order.righe) end;
    v_rows:=v_order.righe;
    for v_key in select key from jsonb_each(v_before||v_after) loop
      v_i:=v_key::integer;
      v_ev:=coalesce((v_rows->v_i->>'qtyEv')::numeric,0)-(coalesce(v_before->>v_key,'0'))::numeric
        +(coalesce(v_after->>v_key,'0'))::numeric;
      v_qty:=(v_rows->v_i->>'qty')::numeric;
      if v_ev<0 or v_ev>v_qty then raise exception 'quantità ordine incoerenti: ricaricare e verificare'; end if;
      v_rows:=jsonb_set(v_rows,array[v_key,'qtyEv'],to_jsonb(v_ev),true);
    end loop;
    update public.ordini_fornitore set righe=v_rows where id=v_order_id and company_id=p_company_id returning * into v_order;
  end if;
  update public.ddt_fornitore set data=v_date,righe=v_new_rows,extra=v_new_extra
    where id=p_ddt_id and company_id=p_company_id returning * into v_ddt;
  v_result:=jsonb_build_object('ddt',to_jsonb(v_ddt),'ordine',case when v_order_id is null then null else to_jsonb(v_order) end,'replayed',false);
  insert into public.supplier_ddt_changes(company_id,request_id,actor_id,ddt_id,action,expected,document,reason,result)
    values(p_company_id,p_request_id,v_actor,p_ddt_id,p_action,p_expected,p_document,p_reason,v_result);
  return v_result;
end;
$$;
revoke all on function public.change_supplier_ddt(uuid,uuid,uuid,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.change_supplier_ddt(uuid,uuid,uuid,text,jsonb,jsonb,text) to authenticated;

-- Invoker trigger: a normal PostgREST writer cannot bypass quantity correction.
-- SECURITY DEFINER domain RPCs execute as their owner and are permitted.
create function public.guard_supplier_ddt_direct_write() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    if TG_OP='DELETE' then raise exception 'usare annullamento tracciato del DDT'; end if;
    if TG_OP='INSERT' then
      if new.of_id is not null then raise exception 'usare la creazione transazionale del DDT'; end if;
      return new;
    end if;
    -- Existing supplier-invoice linking only adds ftfId; it never changes receipt
    -- quantities. Keep that path compatible while protecting quantitative edits.
    if (to_jsonb(new)-'extra'-'updated_at')=(to_jsonb(old)-'extra'-'updated_at')
      and (new.extra-'ftfId')=(old.extra-'ftfId') and old.extra->>'annullato' is distinct from 'true' then
      return new;
    end if;
    if old.of_id is not null or new.of_id is not null or old.extra->>'annullato'='true' then
      raise exception 'usare la rettifica transazionale del DDT';
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger supplier_ddt_direct_write before insert or update or delete on public.ddt_fornitore
for each row execute function public.guard_supplier_ddt_direct_write();
create function public.guard_supplier_order_delete() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and (
    exists(select 1 from public.ddt_fornitore where company_id=old.company_id and of_id=old.id)
    or exists(select 1 from public.fatture_fornitore where company_id=old.company_id and of_id=old.id)
  ) then raise exception 'ordine con documenti collegati: cancellazione non consentita'; end if;
  return old;
end;
$$;
create trigger supplier_order_delete before delete on public.ordini_fornitore
for each row execute function public.guard_supplier_order_delete();
notify pgrst,'reload schema';

-- Stable indexes are required for tracked reversals. The legacy supplier order
-- editor has no source-row identity; reject its structural rewrites, rather than
-- guessing which duplicate code was received. Monotonic manual completion stays.
create function public.guard_supplier_order_receipt_update() returns trigger
language plpgsql set search_path='' as $$
declare v_old jsonb;v_new jsonb;v_i integer;
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if exists(select 1 from public.ddt_fornitore d where d.company_id=old.company_id and d.of_id=old.id
    and exists(select 1 from jsonb_array_elements(d.righe) r where r ? 'source_order_index')) then
    if new.company_id is distinct from old.company_id or new.fornitore_id is distinct from old.fornitore_id
      or jsonb_array_length(new.righe)<>jsonb_array_length(old.righe) then
      raise exception 'ordine con ricezioni tracciate: struttura non modificabile';
    end if;
    for v_old,v_i in select value,ordinality::integer-1 from jsonb_array_elements(old.righe) with ordinality loop
      v_new:=new.righe->v_i;
      if (v_new-'qtyEv') is distinct from (v_old-'qtyEv')
        or coalesce((v_new->>'qtyEv')::numeric,0)<coalesce((v_old->>'qtyEv')::numeric,0)
        or coalesce((v_new->>'qtyEv')::numeric,0)>(v_new->>'qty')::numeric then
        raise exception 'ordine con ricezioni tracciate: usare rettifica o annullamento del DDT';
      end if;
    end loop;
  end if;
  return new;
end; $$;
create trigger supplier_order_receipt_update before update on public.ordini_fornitore
  for each row execute function public.guard_supplier_order_receipt_update();
