-- Append/reverse payment operations, never replace arrays from stale clients.
create table public.invoice_payment_operations(
 company_id uuid not null references public.companies(id) on delete cascade,
 request_id uuid not null,actor_id uuid,invoice_kind text not null,
 invoice_id uuid not null,action text not null,payload jsonb not null,
 before_state jsonb not null,after_state jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(company_id,request_id)
);
alter table public.invoice_payment_operations enable row level security;
revoke all on public.invoice_payment_operations from public,anon,authenticated;

create function public.invoice_gross_total(p_rows jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare r jsonb; discount text;factor numeric; total numeric:=0; qty numeric;price numeric;vat numeric;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'righe documento non valide';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  qty:=coalesce(nullif(r->>'qty',''),'0')::numeric;
  price:=coalesce(nullif(r->>'prezzo',''),'0')::numeric;
  vat:=coalesce(nullif(r->>'iva',''),'0')::numeric;
  if qty::text in ('NaN','Infinity','-Infinity') or price::text in ('NaN','Infinity','-Infinity') or vat::text in ('NaN','Infinity','-Infinity') then raise exception 'importi documento non finiti';end if;
  factor:=1;
  foreach discount in array string_to_array(coalesce(r->>'sconto',''),'+') loop
   factor:=factor*(1-coalesce(nullif(trim(discount),''),'0')::numeric/100);
  end loop;
  total:=total+qty*price*factor*(1+vat/100);
 end loop;
 if total::text in ('NaN','Infinity','-Infinity') then raise exception 'totale documento non finito';end if;
 return round(total,2);
end$$;
revoke all on function public.invoice_gross_total(jsonb) from public,anon,authenticated;

create function public.mutate_invoice_payment(
 p_company_id uuid,p_kind text,p_invoice_id uuid,p_request_id uuid,p_action text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();invoice_table text;credit_table text;doc jsonb;result jsonb;
 op public.invoice_payment_operations%rowtype;payments jsonb;before_state jsonb;after_state jsonb;
 entry jsonb;next_payments jsonb:='[]';found_payment boolean:=false;idx integer;
 amount numeric;gross numeric;credit numeric;paid_total numeric;payment_date date;
 payment_id uuid;is_paid boolean;paid_date date;legacy_paid boolean;
begin
 if actor is null or p_company_id is null or p_invoice_id is null or p_request_id is null then raise exception 'accesso e identificativi richiesti';end if;
 if p_kind='customer' then invoice_table:='fatture_cliente';credit_table:='note_credito';
 elsif p_kind='supplier' then invoice_table:='fatture_fornitore';credit_table:='note_credito_fornitore';
 else raise exception 'tipo fattura non valido';end if;
 if p_action is null or p_action not in ('add','remove','settle','clear') or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'azione pagamento non valida';end if;
 perform 1 from public.memberships where company_id=p_company_id and user_id=actor and role in ('admin','operatore') for share;
 if not found then raise exception 'operazione non autorizzata';end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-payment:'||p_company_id::text||':'||p_request_id::text,0));
 select * into op from public.invoice_payment_operations where company_id=p_company_id and request_id=p_request_id;
 if found then
  if op.actor_id<>actor or op.invoice_kind<>p_kind or op.invoice_id<>p_invoice_id or op.action<>p_action or op.payload is distinct from p_payload then raise exception 'identificativo pagamento già utilizzato con dati diversi';end if;
  return op.result;
 end if;
 execute format('select to_jsonb(f) from public.%I f where f.id=$1 and f.company_id=$2 for update',invoice_table) into doc using p_invoice_id,p_company_id;
 if doc is null then raise exception 'fattura non disponibile per questa azienda';end if;
 if doc#>>'{extra,annullato}'='true' then raise exception 'fattura annullata';end if;
 payments:=doc->'pagamenti';
 if jsonb_typeof(payments) is distinct from 'array' then raise exception 'storico pagamenti non valido';end if;
 before_state:=jsonb_build_object('pagamenti',payments,'paid',doc->'paid','paid_date',doc->'paid_date');
 legacy_paid:=doc->>'paid'='true' and jsonb_array_length(payments)=0;
 if legacy_paid and p_action not in ('clear','settle') then raise exception 'stato storico saldato senza movimenti: prima riaprire esplicitamente la fattura';end if;
 gross:=public.invoice_gross_total(doc->'righe');
 if gross<0 then raise exception 'totale fattura negativo: usare una rettifica dedicata';end if;
 credit:=public.invoice_credit_total(p_company_id,p_kind,p_invoice_id);
 if credit<0 then raise exception 'totale note credito non valido';end if;
 paid_total:=0;
 for entry in select value from jsonb_array_elements(payments) loop
  if jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry->'importo') is distinct from 'number' or (entry->>'importo')::numeric<=0 then raise exception 'movimento storico non valido';end if;
  paid_total:=paid_total+(entry->>'importo')::numeric;
 end loop;
 if p_action in ('add','settle') then
  if jsonb_typeof(p_payload->'data') is distinct from 'string' or (p_payload->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'data pagamento non valida';end if;
  payment_date:=(p_payload->>'data')::date;
  if p_action='add' then
   if jsonb_typeof(p_payload->'importo') is distinct from 'number' then raise exception 'importo pagamento non valido';end if;
   amount:=(p_payload->>'importo')::numeric;
   if amount<=0 or amount<>round(amount,2) then raise exception 'importo positivo con massimo due decimali richiesto';end if;
  else amount:=case when legacy_paid then 0 else greatest(0,round(gross-credit-paid_total,2)) end;end if;
  if amount>0 then
   payment_id:=gen_random_uuid();
   payments:=payments||jsonb_build_array(jsonb_build_object('payment_id',payment_id,'data',payment_date,'importo',amount));
  end if;
 elsif p_action='remove' then
  if p_payload ? 'payment_id' then
   payment_id:=(p_payload->>'payment_id')::uuid;
   for entry in select value from jsonb_array_elements(payments) loop
    if entry->>'payment_id'=payment_id::text then found_payment:=true;
    else next_payments:=next_payments||jsonb_build_array(entry);end if;
   end loop;
   if not found_payment then raise exception 'pagamento non disponibile: ricaricare';end if;
   payments:=next_payments;
  else
   if p_payload->'expected_payments' is distinct from payments then raise exception 'pagamenti modificati: ricaricare prima della rimozione';end if;
   if jsonb_typeof(p_payload->'index') is distinct from 'number' or (p_payload->>'index') !~ '^[0-9]+$' then raise exception 'indice pagamento non valido';end if;
   idx:=(p_payload->>'index')::integer;
   if idx>=jsonb_array_length(payments) then raise exception 'pagamento non disponibile';end if;
   payments:=payments-idx;
  end if;
 else
  if p_payload->'expected_payments' is distinct from payments or p_payload->'expected_paid' is distinct from doc->'paid' or p_payload->'expected_paid_date' is distinct from doc->'paid_date' then raise exception 'pagamenti modificati: ricaricare prima di riaprire';end if;
  payments:='[]';
 end if;
 select coalesce(sum((value->>'importo')::numeric),0) into paid_total from jsonb_array_elements(payments);
 is_paid:=paid_total+credit>=gross-0.01 and (paid_total+credit>0.004 or gross=0);
 paid_date:=case when is_paid and jsonb_array_length(payments)>0 then nullif(payments->(jsonb_array_length(payments)-1)->>'data','')::date else null end;
 if legacy_paid and p_action='settle' then is_paid:=true;paid_date:=(doc->>'paid_date')::date;end if;
 -- Clearing payments doesn't negate a credit note: a fully credited invoice remains settled.
 execute format('update public.%I set pagamenti=$1,paid=$2,paid_date=$3 where id=$4 and company_id=$5 returning to_jsonb(%I)',invoice_table,invoice_table) into result using payments,is_paid,paid_date,p_invoice_id,p_company_id;
 after_state:=jsonb_build_object('pagamenti',payments,'paid',is_paid,'paid_date',paid_date);
 insert into public.invoice_payment_operations values(p_company_id,p_request_id,actor,p_kind,p_invoice_id,p_action,p_payload,before_state,after_state,result,now());
 return result;
end$$;
revoke all on function public.mutate_invoice_payment(uuid,text,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.mutate_invoice_payment(uuid,text,uuid,uuid,text,jsonb) to authenticated;

create function public.guard_invoice_payment_write() returns trigger language plpgsql set search_path='' as $$
declare existing jsonb;
begin
 if current_user not in ('anon','authenticated') then
  if TG_OP='DELETE' then return old;else return new;end if;
 end if;
 if TG_OP='DELETE' then
  if jsonb_array_length(old.pagamenti)>0 or old.paid then raise exception 'fattura con pagamenti: cancellazione non consentita, usare uno storno tracciato';end if;
  return old;
 end if;
 if TG_OP='UPDATE' then
  if row(new.pagamenti,new.paid,new.paid_date) is distinct from row(old.pagamenti,old.paid,old.paid_date) then raise exception 'usare la registrazione pagamenti dedicata';end if;
  if (jsonb_array_length(old.pagamenti)>0 or old.paid) and new.righe is distinct from old.righe then raise exception 'fattura con pagamenti: rettificare tramite un flusso tracciato';end if;
 else
  if coalesce(new.paid,false) or new.paid_date is not null or new.pagamenti is distinct from '[]'::jsonb then
   -- Keep existing unchanged UPSERTs from document editors compatible.
   execute format('select to_jsonb(f) from public.%I f where id=$1 and company_id=$2 for share',TG_TABLE_NAME) into existing using new.id,new.company_id;
   if existing is null or new.pagamenti is distinct from existing->'pagamenti' or to_jsonb(new.paid) is distinct from existing->'paid' or to_jsonb(new.paid_date) is distinct from nullif(existing->'paid_date','null'::jsonb) then raise exception 'usare la registrazione pagamenti dedicata';end if;
  end if;
 end if;
 return new;
end$$;
create trigger invoice_payment_guard before insert or update or delete on public.fatture_cliente for each row execute function public.guard_invoice_payment_write();
create trigger invoice_payment_guard before insert or update or delete on public.fatture_fornitore for each row execute function public.guard_invoice_payment_write();

-- UUID FK is authoritative. Single-number legacy references remain supported;
-- multi-invoice legacy credits require explicit allocation before settlement.
create function public.credit_note_invoice_ids(p_company uuid,p_kind text,p_note jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare refs jsonb;ids uuid[];t text;
begin
 t:=case p_kind when 'customer' then 'fatture_cliente' when 'supplier' then 'fatture_fornitore' else null end;
 if t is null then raise exception 'tipo fattura non valido';end if;
 if nullif(p_note->>'fattura_id','') is not null then return array[(p_note->>'fattura_id')::uuid];end if;
 if p_kind='customer' then
  if jsonb_typeof(p_note#>'{extra,ftIds}')='array' and jsonb_array_length(p_note#>'{extra,ftIds}')>0 then refs:=p_note#>'{extra,ftIds}';
  elsif jsonb_typeof(p_note#>'{extra,ftId}')='string' then refs:=jsonb_build_array(p_note#>>'{extra,ftId}');else return '{}';end if;
 else
  if jsonb_typeof(p_note#>'{extra,ftfId}')='string' then refs:=jsonb_build_array(p_note#>>'{extra,ftfId}');else return '{}';end if;
 end if;
 execute format('select coalesce(array_agg(id order by id),''{}''::uuid[]) from public.%I where company_id=$1 and num in (select jsonb_array_elements_text($2))',t) into ids using p_company,refs;
 return ids;
end$$;
revoke all on function public.credit_note_invoice_ids(uuid,text,jsonb) from public,anon,authenticated;

create function public.invoice_credit_total(p_company uuid,p_kind text,p_invoice uuid) returns numeric
language plpgsql security definer set search_path='' as $$
declare t text;ct text;invoice jsonb;nc jsonb;ids uuid[];total numeric:=0;refs jsonb;ref_count integer;
begin
 if p_kind='customer' then t:='fatture_cliente';ct:='note_credito';else t:='fatture_fornitore';ct:='note_credito_fornitore';end if;
 execute format('select to_jsonb(f) from public.%I f where company_id=$1 and id=$2',t) into invoice using p_company,p_invoice;
 if invoice is null then raise exception 'fattura non disponibile';end if;
 for nc in execute format('select to_jsonb(n) from public.%I n where company_id=$1 and coalesce(extra->>''annullato'',''false'')<>''true''',ct) using p_company loop
  ids:=public.credit_note_invoice_ids(p_company,p_kind,nc);
  if not p_invoice=any(ids) then continue;end if;
  if p_kind='customer' and nc->>'cliente_id' is distinct from invoice->>'cliente_id' or p_kind='supplier' and nc->>'fornitore_id' is distinct from invoice->>'fornitore_id' then raise exception 'nota credito collegata a soggetto diverso: verificare i dati';end if;
  if nullif(nc->>'fattura_id','') is null and p_kind='customer' and jsonb_typeof(nc#>'{extra,ftIds}')='array' then
   select count(distinct value) into ref_count from jsonb_array_elements_text(nc#>'{extra,ftIds}');
   if ref_count>1 then raise exception 'nota credito legacy su più fatture: definire allocazione prima di registrare pagamenti';end if;
  end if;
  total:=total+public.invoice_gross_total(nc->'righe');
 end loop;
 return total;
end$$;
revoke all on function public.invoice_credit_total(uuid,text,uuid) from public,anon,authenticated;

-- Lock every old/new target in UUID order before a credit mutation; payments
-- hold the same invoice lock. Recompute explicit-payment status after mutation.
create function public.synchronize_credit_payment_state() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text;t text;company uuid;ids uuid[]:='{}';id uuid;invoice jsonb;result jsonb;
 cash numeric;credit numeric;gross numeric;settled boolean;settled_date date;before_state jsonb;after_state jsonb;
begin
 kind:=case TG_TABLE_NAME when 'note_credito' then 'customer' else 'supplier' end;
 t:=case kind when 'customer' then 'fatture_cliente' else 'fatture_fornitore' end;
 company:=case when TG_OP='DELETE' then old.company_id else new.company_id end;
 if TG_OP<>'INSERT' then ids:=ids||public.credit_note_invoice_ids(old.company_id,kind,to_jsonb(old));end if;
 if TG_OP<>'DELETE' then ids:=ids||public.credit_note_invoice_ids(new.company_id,kind,to_jsonb(new));end if;
 for id in select distinct v from unnest(ids) v order by v loop
  execute format('select to_jsonb(f) from public.%I f where company_id=$1 and id=$2 for update',t) into invoice using company,id;
  if invoice is null then continue;end if;
  if TG_WHEN='BEFORE' then continue;end if;
  -- Empty legacy ledgers can carry historical paid flags: never invent money.
  if jsonb_typeof(invoice->'pagamenti') is distinct from 'array' or jsonb_array_length(invoice->'pagamenti')=0 then continue;end if;
  select coalesce(sum((value->>'importo')::numeric),0) into cash from jsonb_array_elements(invoice->'pagamenti');
  credit:=public.invoice_credit_total(company,kind,id);gross:=public.invoice_gross_total(invoice->'righe');
  settled:=cash+credit>=gross-0.01 and cash+credit>0.004;
  settled_date:=case when settled then nullif(invoice->'pagamenti'->(jsonb_array_length(invoice->'pagamenti')-1)->>'data','')::date else null end;
  before_state:=jsonb_build_object('pagamenti',invoice->'pagamenti','paid',invoice->'paid','paid_date',invoice->'paid_date');
  after_state:=jsonb_build_object('pagamenti',invoice->'pagamenti','paid',settled,'paid_date',settled_date);
  if before_state=after_state then continue;end if;
  execute format('update public.%I set paid=$1,paid_date=$2 where company_id=$3 and id=$4 returning to_jsonb(%I)',t,t) into result using settled,settled_date,company,id;
  insert into public.invoice_payment_operations values(company,gen_random_uuid(),auth.uid(),kind,id,'credit_refresh',jsonb_build_object('source','credit_note_trigger','credit_id',case when TG_OP='DELETE' then old.id else new.id end),before_state,after_state,result,now());
 end loop;
 if TG_OP='DELETE' then return old;else return new;end if;
end$$;
revoke all on function public.synchronize_credit_payment_state() from public,anon,authenticated;
create trigger credit_payment_lock before insert or update or delete on public.note_credito for each row execute function public.synchronize_credit_payment_state();
create trigger credit_payment_refresh after insert or update or delete on public.note_credito for each row execute function public.synchronize_credit_payment_state();
create trigger credit_payment_lock before insert or update or delete on public.note_credito_fornitore for each row execute function public.synchronize_credit_payment_state();
create trigger credit_payment_refresh after insert or update or delete on public.note_credito_fornitore for each row execute function public.synchronize_credit_payment_state();
notify pgrst,'reload schema';
