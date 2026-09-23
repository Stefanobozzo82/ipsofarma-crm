-- Preserve function behavior and ACLs; explicit literal types for PostgreSQL lint.
create or replace function public.mutate_invoice_payment(
 p_company_id uuid,p_kind text,p_invoice_id uuid,p_request_id uuid,p_action text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();invoice_table text;doc jsonb;result jsonb;
 op public.invoice_payment_operations%rowtype;payments jsonb;before_state jsonb;after_state jsonb;
 entry jsonb;next_payments jsonb:='[]'::jsonb;found_payment boolean:=false;idx integer;
 amount numeric;gross numeric;credit numeric;paid_total numeric;payment_date date;
 payment_id uuid;is_paid boolean;paid_date date;legacy_paid boolean;
begin
 if actor is null or p_company_id is null or p_invoice_id is null or p_request_id is null then raise exception 'accesso e identificativi richiesti';end if;
 if p_kind='customer' then invoice_table:='fatture_cliente';
 elsif p_kind='supplier' then invoice_table:='fatture_fornitore';
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

create or replace function public.credit_note_invoice_ids(p_company uuid,p_kind text,p_note jsonb) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare refs jsonb;ids uuid[];t text;
begin
 t:=case p_kind when 'customer' then 'fatture_cliente' when 'supplier' then 'fatture_fornitore' else null end;
 if t is null then raise exception 'tipo fattura non valido';end if;
 if nullif(p_note->>'fattura_id','') is not null then return array[(p_note->>'fattura_id')::uuid];end if;
 if p_kind='customer' then
  if jsonb_typeof(p_note#>'{extra,ftIds}')='array' and jsonb_array_length(p_note#>'{extra,ftIds}')>0 then refs:=p_note#>'{extra,ftIds}';
  elsif jsonb_typeof(p_note#>'{extra,ftId}')='string' then refs:=jsonb_build_array(p_note#>>'{extra,ftId}');else return '{}'::uuid[];end if;
 else
  if jsonb_typeof(p_note#>'{extra,ftfId}')='string' then refs:=jsonb_build_array(p_note#>>'{extra,ftfId}');else return '{}'::uuid[];end if;
 end if;
 execute format('select coalesce(array_agg(id order by id),''{}''::uuid[]) from public.%I where company_id=$1 and num in (select jsonb_array_elements_text($2))',t) into ids using p_company,refs;
 return ids;
end$$;

create or replace function public.invoice_credit_total(p_company uuid,p_kind text,p_invoice uuid) returns numeric
language plpgsql security definer set search_path='' as $$
declare t text;ct text;invoice jsonb;nc jsonb;ids uuid[];total numeric:=0;ref_count integer;
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

create or replace function public.update_supplier_order(
  p_company_id uuid,p_order_id uuid,p_expected jsonb,p_document jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.ordini_fornitore%rowtype; v_snapshot jsonb; v_row jsonb; v_old jsonb;
  v_rows jsonb := '[]'::jsonb; v_seen integer[] := '{}'::integer[]; v_index integer; v_position integer;
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
