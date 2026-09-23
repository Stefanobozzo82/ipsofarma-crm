-- Full-DDT invoice creation only. Legacy edits/deletes/payment writes remain separate.
create table public.supplier_invoice_operations (
 company_id uuid not null references public.companies(id) on delete cascade,
 request_id uuid not null, actor_id uuid not null, ddtf_id uuid not null,
 expected_ddt jsonb not null, document jsonb not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(company_id,request_id)
);
alter table public.supplier_invoice_operations enable row level security;
revoke all on public.supplier_invoice_operations from public,anon,authenticated;

create function public.create_supplier_invoice(p_company_id uuid,p_ddt_id uuid,p_request_id uuid,p_expected_ddt jsonb,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); d public.ddt_fornitore%rowtype; o public.ordini_fornitore%rowtype;
 f public.fatture_fornitore%rowtype; op public.supplier_invoice_operations%rowtype;
 order_id uuid; snapshot jsonb; r jsonb; source jsonb; totals jsonb:='{}'::jsonb; rows_out jsonb:='[]'::jsonb;
 idx integer; matches integer; q numeric; total numeric; ids jsonb; result jsonb;
 invoice_date date; invoice_num text; number_parts text[];
begin
 if actor is null or p_company_id is null or p_ddt_id is null or p_request_id is null then raise exception 'accesso e identificativi richiesti'; end if;
 perform 1 from public.memberships where company_id=p_company_id and user_id=actor and role in ('admin','operatore') for share;
 if not found then raise exception 'operazione non autorizzata'; end if;
 if jsonb_typeof(p_expected_ddt) is distinct from 'object' or jsonb_typeof(p_document) is distinct from 'object' then raise exception 'snapshot o documento non valido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier-invoice:'||p_company_id::text||':'||p_request_id::text,0));
 select * into op from public.supplier_invoice_operations where company_id=p_company_id and request_id=p_request_id;
 if found then
  if op.actor_id<>actor or op.ddtf_id<>p_ddt_id or op.expected_ddt is distinct from p_expected_ddt or op.document is distinct from p_document then raise exception 'identificativo operazione già utilizzato con dati diversi'; end if;
  return op.result || '{"replayed":true}'::jsonb;
 end if;
 select of_id into order_id from public.ddt_fornitore where id=p_ddt_id and company_id=p_company_id;
 if not found then raise exception 'DDT non disponibile'; end if;
 -- Same order-first lock order as delivery creation/lifecycle. Recheck after locking DDT.
 if order_id is not null then
  select * into o from public.ordini_fornitore where id=order_id and company_id=p_company_id for update;
  if not found then raise exception 'ordine non disponibile'; end if;
 end if;
 select * into d from public.ddt_fornitore where id=p_ddt_id and company_id=p_company_id for update;
 if not found or d.of_id is distinct from order_id then raise exception 'DDT modificato: ricaricare'; end if;
 if d.extra->>'annullato'='true' then raise exception 'DDT annullato'; end if;
 if nullif(d.extra->>'ftfId','') is not null or exists(select 1 from public.fatture_fornitore where company_id=p_company_id and ddtf_id=d.id) then raise exception 'DDT già fatturato'; end if;
 snapshot:=jsonb_build_object('fornitore_id',d.fornitore_id,'of_id',d.of_id,'righe',d.righe,'extra',jsonb_build_object('ftfId',coalesce(d.extra->'ftfId','null'::jsonb),'annullato',coalesce(d.extra->'annullato'='true'::jsonb,false)));
 if snapshot is distinct from p_expected_ddt then raise exception 'DDT modificato: ricaricare'; end if;
 if p_document->>'fornitore_id' is distinct from d.fornitore_id::text or (p_document->>'of_id') is distinct from d.of_id::text then raise exception 'fornitore o ordine non corrispondente al DDT'; end if;
 perform 1 from public.fornitori where id=d.fornitore_id and company_id=p_company_id for share;
 if not found or (order_id is not null and o.fornitore_id<>d.fornitore_id) then raise exception 'fornitore non coerente'; end if;
 if jsonb_typeof(p_document->'data') is distinct from 'string' or (p_document->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'data fattura non valida'; end if;
 invoice_date:=(p_document->>'data')::date;
 if p_document ? 'num' and jsonb_typeof(p_document->'num') not in ('string','null') then raise exception 'numero non valido'; end if;
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
   if matches<>1 then raise exception 'riga DDT ambigua: ricrea le righe selezionando il DDT'; end if;
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
 if invoice_num is null then invoice_num:=public.next_document_number(p_company_id,'FTF',extract(year from invoice_date)::integer);
 else
  number_parts:=regexp_match(invoice_num,'^FTF/([0-9]{4})/([0-9]+)$');
  if number_parts is not null then perform public.bump_document_counter(p_company_id,'FTF',number_parts[1]::integer,number_parts[2]::integer+1); end if;
 end if;
 insert into public.fatture_fornitore(company_id,num,data,fornitore_id,ddtf_id,of_id,righe)
 values(p_company_id,invoice_num,invoice_date,d.fornitore_id,d.id,d.of_id,rows_out) returning * into f;
 update public.ddt_fornitore set extra=extra||jsonb_build_object('ftfId',f.num) where id=d.id returning * into d;
 if order_id is not null then
  ids:=coalesce(nullif(o.ftf_ids,'null'::jsonb),'[]'::jsonb); if jsonb_typeof(ids) is distinct from 'array' then raise exception 'collegamenti fatture ordine non validi'; end if;
  if jsonb_typeof(o.extra->'ftfId')='string' and nullif(trim(o.extra->>'ftfId'),'') is not null and not ids @> jsonb_build_array(o.extra->>'ftfId') then ids:=ids||jsonb_build_array(o.extra->>'ftfId'); end if;
  if not ids @> jsonb_build_array(f.num) then ids:=ids||jsonb_build_array(f.num); end if;
  update public.ordini_fornitore set ftf_ids=ids,extra=extra||jsonb_build_object('ftfId',f.num) where id=o.id returning * into o;
 end if;
 result:=jsonb_build_object('fattura',to_jsonb(f),'ddt',to_jsonb(d),'ordine',case when order_id is null then null else to_jsonb(o) end,'replayed',false);
 insert into public.supplier_invoice_operations values(p_company_id,p_request_id,actor,d.id,p_expected_ddt,p_document,result,now());
 return result;
end;
$$;
revoke all on function public.create_supplier_invoice(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_supplier_invoice(uuid,uuid,uuid,jsonb,jsonb) to authenticated;

-- Client API must not bypass the DDT lock by inserting/relinking invoices.
-- Invoker context is intentional: the SECURITY DEFINER RPC runs as its owner.
create function public.guard_supplier_invoice_link() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if TG_OP='DELETE' then
   if old.ddtf_id is not null then raise exception 'fattura collegata: cancellazione non consentita; occorre uno storno tracciato'; end if;
   return old;
  end if;
  if TG_OP='INSERT' then
   -- saveDoc uses UPSERT even for payment edits: permit only an existing
   -- same-id/same-tenant/same-DDT row, then UPDATE checks the link again.
   if new.ddtf_id is not null and not exists (
    select 1 from public.fatture_fornitore f where f.id=new.id and f.company_id=new.company_id and f.ddtf_id=new.ddtf_id for share
   ) then raise exception 'usare create_supplier_invoice per fatturare un DDT'; end if;
  elsif new.ddtf_id is distinct from old.ddtf_id then
   raise exception 'modifica collegamento DDT non consentita';
  elsif old.ddtf_id is not null and row(new.company_id,new.num,new.data,new.fornitore_id,new.of_id,new.righe)
    is distinct from row(old.company_id,old.num,old.data,old.fornitore_id,old.of_id,old.righe) then
   raise exception 'fattura collegata: dati documento bloccati; sono consentiti solo incassi e metadati';
  end if;
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;
$$;
create trigger guard_supplier_invoice_link before insert or update or delete on public.fatture_fornitore
for each row execute function public.guard_supplier_invoice_link();
notify pgrst,'reload schema';

-- Standalone receipts may attach an existing invoice. Both directions of this
-- association and the receipt creation must commit together, never as two API writes.
create table public.supplier_standalone_ddt_operations (
 company_id uuid not null references public.companies(id) on delete cascade,
 request_id uuid not null,actor_id uuid not null,document jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(company_id,request_id)
);
alter table public.supplier_standalone_ddt_operations enable row level security;
revoke all on public.supplier_standalone_ddt_operations from public,anon,authenticated;
create function public.create_standalone_supplier_ddt(p_company_id uuid,p_request_id uuid,p_document jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();supplier uuid;invoice public.fatture_fornitore%rowtype;
 receipt public.ddt_fornitore%rowtype;prior public.supplier_standalone_ddt_operations%rowtype;
 receipt_date date;receipt_num text;r jsonb;result jsonb;
begin
 if actor is null or p_company_id is null or p_request_id is null then raise exception 'accesso e identificativi richiesti'; end if;
 perform 1 from public.memberships where company_id=p_company_id and user_id=actor and role in ('admin','operatore') for share;
 if not found then raise exception 'operazione non autorizzata'; end if;
 if jsonb_typeof(p_document) is distinct from 'object' then raise exception 'documento non valido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier-standalone-receipt:'||p_company_id||':'||p_request_id,0));
 select * into prior from public.supplier_standalone_ddt_operations where company_id=p_company_id and request_id=p_request_id;
 if found then
  if prior.actor_id<>actor or prior.document is distinct from p_document then raise exception 'identificativo operazione già utilizzato con dati diversi'; end if;
  return prior.result||'{"replayed":true}'::jsonb;
 end if;
 if jsonb_typeof(p_document->'fornitore_id') is distinct from 'string'
  or jsonb_typeof(p_document->'data') is distinct from 'string'
  or (p_document->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or jsonb_typeof(p_document->'num') is distinct from 'string' or trim(p_document->>'num')=''
  or jsonb_typeof(p_document->'righe') is distinct from 'array' or jsonb_array_length(p_document->'righe')=0 then
  raise exception 'fornitore, data, numero o righe DDT non validi';
 end if;
 if nullif(p_document->>'of_id','') is not null then raise exception 'usare la ricezione da ordine'; end if;
 supplier:=(p_document->>'fornitore_id')::uuid;
 perform 1 from public.fornitori where id=supplier and company_id=p_company_id for share;
 if not found then raise exception 'fornitore non disponibile'; end if;
 for r in select value from jsonb_array_elements(p_document->'righe') loop
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'qty') is distinct from 'number' or (r->>'qty')::numeric<=0 then
   raise exception 'quantità DDT non valida';
  end if;
 end loop;
 receipt_date:=(p_document->>'data')::date;receipt_num:=trim(p_document->>'num');
 if nullif(p_document->>'fattura_id','') is not null then
  select * into invoice from public.fatture_fornitore where id=(p_document->>'fattura_id')::uuid and company_id=p_company_id for update;
  if not found or invoice.fornitore_id<>supplier or invoice.ddtf_id is not null or invoice.extra->>'annullato'='true' then
   raise exception 'fattura non disponibile per questo DDT';
  end if;
 end if;
 insert into public.ddt_fornitore(company_id,num,data,fornitore_id,righe)
  values(p_company_id,receipt_num,receipt_date,supplier,p_document->'righe') returning * into receipt;
 if invoice.id is not null then
  update public.fatture_fornitore set ddtf_id=receipt.id where id=invoice.id returning * into invoice;
  update public.ddt_fornitore set extra=extra||jsonb_build_object('ftfId',invoice.num) where id=receipt.id returning * into receipt;
 end if;
 result:=jsonb_build_object('ddt',to_jsonb(receipt),'ordine',null,'fattura',case when invoice.id is null then null else to_jsonb(invoice) end,'replayed',false);
 insert into public.supplier_standalone_ddt_operations(company_id,request_id,actor_id,document,result) values(p_company_id,p_request_id,actor,p_document,result);
 return result;
end; $$;
revoke all on function public.create_standalone_supplier_ddt(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_standalone_supplier_ddt(uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
