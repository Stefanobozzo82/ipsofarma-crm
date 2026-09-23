-- Full-DDT invoice creation only. Legacy edits/deletes/payment writes remain separate.
create table public.customer_invoice_operations (
 company_id uuid not null references public.companies(id) on delete cascade,
 request_id uuid not null, actor_id uuid not null, ddt_id uuid not null,
 expected_ddt jsonb not null, document jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(company_id,request_id)
);
alter table public.customer_invoice_operations enable row level security;
revoke all on public.customer_invoice_operations from public,anon,authenticated;

create function public.create_customer_invoice(p_company_id uuid,p_ddt_id uuid,p_request_id uuid,p_expected_ddt jsonb,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); d public.ddt%rowtype; o public.ordini_cliente%rowtype;
 f public.fatture_cliente%rowtype; op public.customer_invoice_operations%rowtype;
 order_id uuid; snapshot jsonb; r jsonb; source jsonb; totals jsonb:='{}'; rows_out jsonb:='[]';
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
 for idx in 0..jsonb_array_length(d.righe)-1 loop
  if coalesce((totals->>idx::text)::numeric,0) is distinct from (d.righe->idx->>'qty')::numeric then raise exception 'fatturare tutte le quantità del DDT esattamente'; end if;
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
revoke all on function public.create_customer_invoice(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_customer_invoice(uuid,uuid,uuid,jsonb,jsonb) to authenticated;

-- Client API must not bypass the DDT lock by inserting/relinking invoices.
-- Invoker context is intentional: the SECURITY DEFINER RPC runs as its owner.
create function public.guard_customer_invoice_link() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if TG_OP='DELETE' then
   if old.ddt_id is not null then raise exception 'fattura collegata: cancellazione non consentita; occorre uno storno tracciato'; end if;
   return old;
  end if;
  if TG_OP='INSERT' then
   -- saveDoc uses UPSERT even for payment edits: permit only an existing
   -- same-id/same-tenant/same-DDT row, then UPDATE checks the link again.
   if new.ddt_id is not null and not exists (
    select 1 from public.fatture_cliente f where f.id=new.id and f.company_id=new.company_id and f.ddt_id=new.ddt_id for share
   ) then raise exception 'usare create_customer_invoice per fatturare un DDT'; end if;
  elsif new.ddt_id is distinct from old.ddt_id then
   raise exception 'modifica collegamento DDT non consentita';
  elsif old.ddt_id is not null and row(new.company_id,new.num,new.data,new.cliente_id,new.oc_id,new.dest_id,new.righe)
    is distinct from row(old.company_id,old.num,old.data,old.cliente_id,old.oc_id,old.dest_id,old.righe) then
   raise exception 'fattura collegata: dati documento bloccati; sono consentiti solo incassi e metadati';
  end if;
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;
$$;
create trigger guard_customer_invoice_link before insert or update or delete on public.fatture_cliente
for each row execute function public.guard_customer_invoice_link();
notify pgrst,'reload schema';
