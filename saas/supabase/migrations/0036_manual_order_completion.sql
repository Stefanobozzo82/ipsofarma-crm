-- Administrative fulfillment only: this operation never creates stock movements.
create table public.manual_order_completions (
 company_id uuid not null references public.companies(id) on delete cascade,
 request_id uuid not null, actor_id uuid not null, kind text not null,
 order_id uuid not null, reason text not null, expected_rows jsonb not null,
 result jsonb not null, created_at timestamptz not null default now(),
 primary key(company_id,request_id)
);
alter table public.manual_order_completions enable row level security;
revoke all on public.manual_order_completions from public,anon,authenticated;

create function public.complete_order_manually(p_company_id uuid,p_kind text,p_order_id uuid,
 p_request_id uuid,p_expected_rows jsonb,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();t text;doc jsonb;result jsonb;r jsonb;
 rows_out jsonb:='[]'::jsonb;qty numeric;fulfilled numeric;
 op public.manual_order_completions%rowtype;
begin
 if actor is null or p_company_id is null or p_order_id is null or p_request_id is null then raise exception 'accesso e identificativi richiesti';end if;
 if p_kind='customer' then t:='ordini_cliente';elsif p_kind='supplier' then t:='ordini_fornitore';else raise exception 'tipo ordine non valido';end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>1000 then raise exception 'motivazione richiesta (3-1000 caratteri)';end if;
 if jsonb_typeof(p_expected_rows) is distinct from 'array' then raise exception 'righe ordine non valide';end if;
 perform 1 from public.memberships where company_id=p_company_id and user_id=actor and role in ('admin','operatore') for share;
 if not found then raise exception 'operazione non autorizzata';end if;
 perform pg_advisory_xact_lock(hashtextextended('manual-order:'||p_company_id::text||':'||p_request_id::text,0));
 select * into op from public.manual_order_completions where company_id=p_company_id and request_id=p_request_id;
 if found then
  if op.actor_id<>actor or op.kind<>p_kind or op.order_id<>p_order_id or op.expected_rows is distinct from p_expected_rows or op.reason is distinct from p_reason then raise exception 'identificativo già utilizzato con dati diversi';end if;
  return op.result;
 end if;
 execute format('select to_jsonb(o) from public.%I o where company_id=$1 and id=$2 for update',t) into doc using p_company_id,p_order_id;
 if doc is null then raise exception 'ordine non disponibile';end if;
 if doc->'righe' is distinct from p_expected_rows then raise exception 'ordine modificato: ricaricare prima del completamento';end if;
 if doc#>>'{extra,annullato}'='true' then raise exception 'ordine annullato';end if;
 for r in select value from jsonb_array_elements(p_expected_rows) loop
  if jsonb_typeof(r->'qty') is distinct from 'number' or (r ? 'qtyEv' and jsonb_typeof(r->'qtyEv') is distinct from 'number') then raise exception 'quantità ordine non valida';end if;
  qty:=(r->>'qty')::numeric;fulfilled:=coalesce((r->>'qtyEv')::numeric,0);
  if qty<0 or fulfilled<0 then raise exception 'quantità ordine negativa';end if;
  rows_out:=rows_out||jsonb_build_array(jsonb_set(r,'{qtyEv}',to_jsonb(greatest(qty,fulfilled)),true));
 end loop;
 -- DDT corrections subtract/add their own quantities from this current total,
 -- preserving the manually completed residual as a deterministic baseline.
 execute format('update public.%I set righe=$1 where company_id=$2 and id=$3 returning to_jsonb(%I)',t,t) into result using rows_out,p_company_id,p_order_id;
 insert into public.manual_order_completions(company_id,request_id,actor_id,kind,order_id,reason,expected_rows,result)
 values(p_company_id,p_request_id,actor,p_kind,p_order_id,p_reason,p_expected_rows,result);
 return result;
end$$;
revoke all on function public.complete_order_manually(uuid,text,uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.complete_order_manually(uuid,text,uuid,uuid,jsonb,text) to authenticated;

create function public.guard_order_fulfillment_write() returns trigger
language plpgsql set search_path='' as $$
declare previous jsonb;oldrows jsonb;r jsonb;i integer;oldqty numeric;newqty numeric;
begin
 if current_user not in ('anon','authenticated') then return new;end if;
 if TG_OP='UPDATE' then oldrows:=old.righe;
 else
  execute format('select to_jsonb(o) from public.%I o where id=$1 and company_id=$2 for share',TG_TABLE_NAME) into previous using new.id,new.company_id;
  oldrows:=coalesce(previous->'righe','[]'::jsonb);
 end if;
 for i in 0..greatest(jsonb_array_length(oldrows),jsonb_array_length(new.righe))-1 loop
  r:=new.righe->i;
  oldqty:=coalesce((oldrows->i->>'qtyEv')::numeric,0);
  newqty:=coalesce((r->>'qtyEv')::numeric,0);
  if oldqty is distinct from newqty or (oldqty<>0 and oldrows->i->>'cod' is distinct from r->>'cod') then
   raise exception 'evasione ordine protetta: usare DDT o completamento manuale tracciato';
  end if;
 end loop;
 return new;
end$$;
create trigger order_fulfillment_guard before insert or update on public.ordini_cliente for each row execute function public.guard_order_fulfillment_write();
create trigger order_fulfillment_guard before insert or update on public.ordini_fornitore for each row execute function public.guard_order_fulfillment_write();
