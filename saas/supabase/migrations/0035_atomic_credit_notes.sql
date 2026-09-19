-- Credit notes are commercial records; this migration does not certify fiscal compliance.
create table public.credit_note_operations (
 company_id uuid not null references public.companies(id) on delete cascade,
 request_id uuid not null,actor_id uuid not null,kind text not null,action text not null,
 payload jsonb not null,before_state jsonb,result jsonb not null,
 created_at timestamptz not null default now(),primary key(company_id,request_id)
);
alter table public.credit_note_operations enable row level security;
revoke all on public.credit_note_operations from public,anon,authenticated;

create function public.mutate_credit_note(p_company_id uuid,p_kind text,p_request_id uuid,p_expected jsonb,p_document jsonb,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t text;it text;pt text;partykey text;oldrow jsonb;doc jsonb;invoice jsonb;result jsonb;
 payload jsonb;prior public.credit_note_operations%rowtype;role_name text;noteid uuid;party uuid;invoiceid uuid;
 num text;d date;extra jsonb;total numeric;matchnum text[];dtype text;r jsonb;v_snapshot jsonb;discount text;
begin
 if auth.uid() is null then raise exception 'accesso richiesto';end if;
 select role into role_name from public.memberships where company_id=p_company_id and user_id=auth.uid() for share;
 if role_name is null or role_name not in ('admin','operatore') then raise exception 'operazione non autorizzata';end if;
 if p_action='cancel' and role_name<>'admin' then raise exception 'annullamento riservato agli amministratori';end if;
 if p_action not in ('save','cancel') or p_request_id is null then raise exception 'operazione non valida';end if;
 if p_kind='customer' then t:='note_credito';it:='fatture_cliente';pt:='clienti';partykey:='cliente_id';dtype:='NC';
 elsif p_kind='supplier' then t:='note_credito_fornitore';it:='fatture_fornitore';pt:='fornitori';partykey:='fornitore_id';dtype:='NCF';
 else raise exception 'tipo nota credito non valido';end if;
 payload:=jsonb_build_object('expected',p_expected,'document',p_document,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':credit:'||p_request_id::text,0));
 select * into prior from public.credit_note_operations where company_id=p_company_id and request_id=p_request_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.kind<>p_kind or prior.action<>p_action or prior.payload<>payload then raise exception 'chiave richiesta già utilizzata con contenuto diverso';end if;
  return prior.result;
 end if;
 if p_expected is not null and p_expected<>'null'::jsonb then
  noteid:=(p_expected->>'id')::uuid;
  execute format('select to_jsonb(n) from public.%I n where company_id=$1 and id=$2 for update',t) into oldrow using p_company_id,noteid;
  if oldrow is null then raise exception 'nota credito non disponibile';end if;
  v_snapshot:=jsonb_build_object('id',oldrow->'id','num',oldrow->'num','data',oldrow->'data',partykey,oldrow->partykey,'fattura_id',oldrow->'fattura_id','righe',oldrow->'righe','extra',oldrow->'extra');
  if p_expected is distinct from v_snapshot then raise exception 'nota credito modificata: ricarica prima di salvare';end if;
  if oldrow#>>'{extra,annullato}'='true' then raise exception 'nota credito già annullata';end if;
  if nullif(oldrow->>'fattura_id','') is null and (oldrow->'extra') ?| array['ftId','ftIds','ftfId'] then raise exception 'collegamento storico da riconciliare prima di modificare';end if;
 elsif p_action='cancel' then raise exception 'nota credito richiesta';
 end if;
 if p_action='cancel' then
  if p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'motivazione annullamento richiesta: da 3 a 1000 caratteri';end if;
  doc:=v_snapshot;
 else doc:=p_document;end if;
 if jsonb_typeof(doc) is distinct from 'object' or jsonb_typeof(doc->'righe') is distinct from 'array'
  or jsonb_typeof(doc->'extra') is distinct from 'object' then raise exception 'documento nota credito non valido';end if;
 party:=(doc->>partykey)::uuid;invoiceid:=nullif(doc->>'fattura_id','')::uuid;
 if party is null then raise exception 'controparte richiesta';end if;
 execute format('select to_jsonb(p) from public.%I p where company_id=$1 and id=$2 for share',pt) into result using p_company_id,party;
 if result is null then raise exception 'controparte non disponibile per questa azienda';end if;
 if oldrow is not null and (doc->partykey is distinct from oldrow->partykey or doc->'fattura_id' is distinct from oldrow->'fattura_id') then raise exception 'controparte e fattura della nota esistente non modificabili';end if;
 extra:=coalesce(oldrow->'extra','{}'::jsonb)||(doc->'extra');
 if p_action='save' and (extra->>'annullato'='true' or (extra-array['annullato','annullatoIl','annullatoDa','motivoAnnullamento']) is distinct from extra and (extra->'annullato' is distinct from oldrow#>'{extra,annullato}' or extra->'annullatoIl' is distinct from oldrow#>'{extra,annullatoIl}' or extra->'annullatoDa' is distinct from oldrow#>'{extra,annullatoDa}' or extra->'motivoAnnullamento' is distinct from oldrow#>'{extra,motivoAnnullamento}')) then raise exception 'usare annullamento dedicato';end if;
 if invoiceid is null and extra ?| array['ftId','ftIds','ftfId'] then raise exception 'collegamento storico da riconciliare prima di salvare';end if;
 if invoiceid is not null then
  execute format('select to_jsonb(f) from public.%I f where company_id=$1 and id=$2 for update',it) into invoice using p_company_id,invoiceid;
  if invoice is null then raise exception 'fattura non disponibile per questa azienda';end if;
  if invoice->>partykey is distinct from party::text then raise exception 'fattura e nota credito devono avere la stessa controparte';end if;
  if invoice#>>'{extra,annullato}'='true' then raise exception 'fattura annullata';end if;
 end if;
 if p_action='cancel' then
  extra:=extra||jsonb_build_object('annullato',true,'annullatoIl',now(),'annullatoDa',auth.uid(),'motivoAnnullamento',trim(p_reason));
  execute format('update public.%I set extra=$1 where id=$2 and company_id=$3 returning to_jsonb(%I)',t,t) into result using extra,noteid,p_company_id;
 else
  if jsonb_array_length(doc->'righe')=0 then raise exception 'almeno una riga richiesta';end if;
  for r in select value from jsonb_array_elements(doc->'righe') loop
   if jsonb_typeof(r->'qty') is distinct from 'number' or (r->>'qty')::numeric<=0 or jsonb_typeof(r->'prezzo') is distinct from 'number' or (r->>'prezzo')::numeric<0 then raise exception 'quantità o prezzo non valido';end if;
   if coalesce((r->>'iva')::numeric,0)<0 then raise exception 'IVA non valida';end if;
   foreach discount in array string_to_array(coalesce(r->>'sconto',''),'+') loop
    if coalesce(nullif(trim(discount),''),'0')::numeric not between 0 and 100 then raise exception 'sconto non valido';end if;
   end loop;
  end loop;
  total:=public.invoice_gross_total(doc->'righe');if total<=0 then raise exception 'totale nota credito deve essere positivo';end if;
  if (doc->>'data') is null or (doc->>'data') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'data non valida';end if;
  d:=(doc->>'data')::date;num:=nullif(trim(doc->>'num'),'');
  if num is null then
   if oldrow is not null or p_kind='supplier' then raise exception 'numero nota credito richiesto';end if;
   num:=public.next_document_number(p_company_id,dtype,extract(year from d)::integer);
  else
   matchnum:=regexp_match(num,'^'||dtype||'/([0-9]{4})/([0-9]+)$');
   if matchnum is not null then perform public.bump_document_counter(p_company_id,dtype,matchnum[1]::integer,matchnum[2]::integer+1);end if;
  end if;
  if oldrow is null then
   execute format('insert into public.%I(company_id,num,data,%I,fattura_id,righe,extra) values($1,$2,$3,$4,$5,$6,$7) returning to_jsonb(%I)',t,partykey,t) into result using p_company_id,num,d,party,invoiceid,doc->'righe',extra;
  else
   execute format('update public.%I set num=$1,data=$2,righe=$3,extra=$4 where id=$5 and company_id=$6 returning to_jsonb(%I)',t,t) into result using num,d,doc->'righe',extra,noteid,p_company_id;
  end if;
  if invoiceid is not null and public.invoice_credit_total(p_company_id,p_kind,invoiceid)>public.invoice_gross_total(invoice->'righe') then raise exception 'credito cumulativo superiore al totale fattura';end if;
 end if;
 insert into public.credit_note_operations(company_id,request_id,actor_id,kind,action,payload,before_state,result) values(p_company_id,p_request_id,auth.uid(),p_kind,p_action,payload,oldrow,result);
 return result;
end$$;
revoke all on function public.mutate_credit_note(uuid,text,uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
create function public.save_credit_note(p_company_id uuid,p_kind text,p_request_id uuid,p_expected jsonb,p_document jsonb) returns jsonb language sql security definer set search_path='' as $$select public.mutate_credit_note(p_company_id,p_kind,p_request_id,p_expected,p_document,'save',null)$$;
create function public.cancel_credit_note(p_company_id uuid,p_kind text,p_request_id uuid,p_expected jsonb,p_reason text) returns jsonb language sql security definer set search_path='' as $$select public.mutate_credit_note(p_company_id,p_kind,p_request_id,p_expected,'{}'::jsonb,'cancel',p_reason)$$;
revoke all on function public.save_credit_note(uuid,text,uuid,jsonb,jsonb),public.cancel_credit_note(uuid,text,uuid,jsonb,text) from public,anon;
grant execute on function public.save_credit_note(uuid,text,uuid,jsonb,jsonb),public.cancel_credit_note(uuid,text,uuid,jsonb,text) to authenticated;
create function public.guard_credit_note_direct_write() returns trigger language plpgsql set search_path='' as $$begin
 if current_user in ('authenticated','anon') then raise exception 'usare operazione transazionale nota credito';end if;
 if TG_OP='DELETE' then return old;end if;return new;
end$$;
create trigger credit_note_direct_write before insert or update or delete on public.note_credito for each row execute function public.guard_credit_note_direct_write();
create trigger credit_note_direct_write before insert or update or delete on public.note_credito_fornitore for each row execute function public.guard_credit_note_direct_write();
notify pgrst,'reload schema';

-- Invoice edits must not invalidate already recorded credits. Trigger functions
-- execute trusted aggregate helpers; the trigger never grants arbitrary writes.
create function public.guard_invoice_credit_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text;notes text;partykey text;n jsonb;linked boolean:=false;credit numeric;
begin
 kind:=case TG_TABLE_NAME when 'fatture_cliente' then 'customer' else 'supplier' end;
 notes:=case kind when 'customer' then 'note_credito' else 'note_credito_fornitore' end;
 partykey:=case kind when 'customer' then 'cliente_id' else 'fornitore_id' end;
 -- Privileged maintenance without an end-user identity can clean test fixtures.
 if TG_OP='DELETE' and auth.uid() is null then return old;end if;
 if TG_OP='UPDATE' and new.righe is not distinct from old.righe
   and to_jsonb(new)->partykey is not distinct from to_jsonb(old)->partykey then return new;end if;
 for n in execute format('select to_jsonb(n) from public.%I n where company_id=$1',notes) using old.company_id loop
  if old.id=any(public.credit_note_invoice_ids(old.company_id,kind,n)) then linked:=true;exit;end if;
 end loop;
 if TG_OP='DELETE' then
  if linked then raise exception 'fattura con note credito collegate: cancellazione non consentita';end if;
  return old;
 end if;
 if linked and to_jsonb(new)->partykey is distinct from to_jsonb(old)->partykey then raise exception 'fattura con note credito collegate: controparte non modificabile';end if;
 if new.righe is distinct from old.righe then
  credit:=public.invoice_credit_total(old.company_id,kind,old.id);
  if credit>public.invoice_gross_total(new.righe) then raise exception 'totale fattura inferiore al credito già registrato';end if;
 end if;
 return new;
end$$;
revoke all on function public.guard_invoice_credit_integrity() from public,anon,authenticated;
create trigger invoice_credit_integrity before update or delete on public.fatture_cliente for each row execute function public.guard_invoice_credit_integrity();
create trigger invoice_credit_integrity before update or delete on public.fatture_fornitore for each row execute function public.guard_invoice_credit_integrity();
