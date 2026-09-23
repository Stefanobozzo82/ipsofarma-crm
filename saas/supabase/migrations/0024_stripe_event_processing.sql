create table public.stripe_events(id text primary key,event_type text not null,event_created bigint not null,company_id uuid references public.companies(id),outcome text not null,processed_at timestamptz not null default now());
create table public.stripe_subscription_watermarks(subscription_id text primary key,event_created bigint not null,event_id text not null,deleted boolean not null default false);
alter table public.stripe_events enable row level security;
alter table public.stripe_subscription_watermarks enable row level security;
revoke all on public.stripe_events,public.stripe_subscription_watermarks from public,anon,authenticated;
create function public.apply_stripe_event(p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid text:=p_event->>'id'; typ text:=p_event->>'type'; created bigint;
 obj jsonb:=p_event#>'{data,object}'; cid uuid; customer text; sub text;
 c public.companies%rowtype; mark public.stripe_subscription_watermarks%rowtype;
 plan_id text; price text; status text; period_end bigint; outcome text:='processed';
begin
 if eid is null or eid='' or typ is null or jsonb_typeof(p_event->'created') is distinct from 'number' or jsonb_typeof(obj) is distinct from 'object' then raise exception 'invalid Stripe event'; end if;
 created:=(p_event->>'created')::bigint;
 if created<0 then raise exception 'invalid timestamp'; end if;
 perform pg_advisory_xact_lock(hashtextextended('stripe-event:'||eid,0));
 if exists(select 1 from public.stripe_events where id=eid) then return '{"duplicate":true}'::jsonb; end if;
 if typ not in ('checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted') then
  insert into public.stripe_events values(eid,typ,created,null,'ignored',now()); return '{"ignored":true}'::jsonb;
 end if;
 customer:=obj->>'customer'; if customer is null or customer='' then raise exception 'customer missing'; end if;
 if typ='checkout.session.completed' then
  sub:=obj->>'subscription'; cid:=(obj->>'client_reference_id')::uuid;
  if sub is null or sub='' or cid is null then raise exception 'checkout mapping missing'; end if;
  select * into c from public.companies where id=cid for update;
  if not found then raise exception 'checkout company missing: retry'; end if;
  if c.stripe_customer_id is not null and c.stripe_customer_id<>customer then raise exception 'customer mismatch'; end if;
  if c.stripe_subscription_id is not null and c.stripe_subscription_id<>sub and coalesce(c.subscription_status,'')<>'canceled' then raise exception 'subscription mismatch: reconcile'; end if;
  if exists(select 1 from public.stripe_subscription_watermarks where subscription_id=sub and deleted) then outcome:='stale';
  else update public.companies set stripe_customer_id=customer,stripe_subscription_id=sub where id=c.id; end if;
 else
  sub:=obj->>'id'; if sub is null or sub='' then raise exception 'subscription missing'; end if;
  select * into c from public.companies where stripe_customer_id=customer for update;
  if not found then raise exception 'subscription company missing: retry'; end if;
  if c.stripe_subscription_id is not null and c.stripe_subscription_id<>sub then raise exception 'subscription mapping mismatch: retry'; end if;
  select * into mark from public.stripe_subscription_watermarks where subscription_id=sub;
  if found and (created<mark.event_created or mark.deleted) then outcome:='stale';
  else
   status:=obj->>'status';
   if typ='customer.subscription.deleted' then status:='canceled';plan_id:='trial';
   else
    if status is null or status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused') then raise exception 'unknown status'; end if;
    if jsonb_typeof(obj#>'{items,data}') is distinct from 'array' or jsonb_array_length(obj#>'{items,data}')<>1 then raise exception 'expected one subscription item'; end if;
    price:=obj#>>'{items,data,0,price,id}';
    select min(id) into plan_id from public.plans where stripe_price_id=price having count(*)=1;
    if not found then raise exception 'unknown Stripe price: configure then retry'; end if;
   end if;
   period_end:=coalesce(obj->>'current_period_end',obj#>>'{items,data,0,current_period_end}')::bigint;
   update public.companies set stripe_subscription_id=sub,subscription_status=status,piano=plan_id,current_period_end=case when period_end is null then null else to_timestamp(period_end) end where id=c.id;
   insert into public.stripe_subscription_watermarks values(sub,created,eid,typ='customer.subscription.deleted') on conflict(subscription_id) do update set event_created=excluded.event_created,event_id=excluded.event_id,deleted=excluded.deleted;
  end if;
 end if;
 insert into public.stripe_events values(eid,typ,created,c.id,outcome,now());
 return jsonb_build_object('outcome',outcome);
end;
$$;
revoke all on function public.apply_stripe_event(jsonb) from public,anon,authenticated;
grant execute on function public.apply_stripe_event(jsonb) to service_role;
notify pgrst,'reload schema';
