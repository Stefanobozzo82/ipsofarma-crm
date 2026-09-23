-- Quota counts accepted attempts, including failed/unknown provider outcomes.
-- An interrupted attempt is never retried automatically: provider execution
-- cannot be made exactly-once without provider-supported idempotency.
alter table public.ai_usage add column request_id uuid;
alter table public.ai_usage add column actor_id uuid;
alter table public.ai_usage add column request_hash text;
alter table public.ai_usage add column model text;
alter table public.ai_usage add column status text not null default 'succeeded'
  check(status in ('pending','succeeded','failed','unknown'));
alter table public.ai_usage add column provider_status integer;
alter table public.ai_usage add column finished_at timestamptz;
create unique index ai_usage_company_request_idx on public.ai_usage(company_id,request_id) where request_id is not null;
drop policy "membri registrano il proprio uso IA" on public.ai_usage;
revoke all on public.ai_usage from public,anon,authenticated,service_role;
do $$ declare v_columns text; begin
  select string_agg(quote_ident(attname),',') into v_columns from pg_attribute
    where attrelid='public.ai_usage'::regclass and attnum>0 and not attisdropped;
  execute format('revoke all privileges (%s) on public.ai_usage from public,anon,authenticated,service_role',v_columns);
end; $$;
grant select on public.ai_usage to authenticated;

create or replace function public.reserve_ai_attempt(
  p_company_id uuid,p_actor_id uuid,p_request_id uuid,p_request_hash text,p_model text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_plan text;v_limit integer;v_count integer;v_usage public.ai_usage%rowtype;v_month timestamptz;
begin
  if p_request_id is null or p_actor_id is null or p_company_id is null
    or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or p_model not in ('gemini-2.5-flash','gemini-3.5-flash') or p_model is null then
    raise exception 'invalid AI reservation';
  end if;
  -- Match the membership-management lock order: company first, membership next.
  -- Only Edge service_role may call; membership is still checked before replay,
  -- counting, or reservation, using the verified user's identity.
  -- NO KEY UPDATE still serializes quota/role managers and plan changes, while
  -- allowing FK KEY SHARE checks by document transactions holding membership SHARE.
  select piano into v_plan from public.companies where id=p_company_id for no key update;
  if not found then return jsonb_build_object('allowed',false,'reason','unavailable'); end if;
  perform 1 from public.memberships where company_id=p_company_id and user_id=p_actor_id for share;
  if not found then return jsonb_build_object('allowed',false,'reason','forbidden'); end if;
  select * into v_usage from public.ai_usage where company_id=p_company_id and request_id=p_request_id;
  if found then
    if v_usage.actor_id is distinct from p_actor_id or v_usage.request_hash is distinct from p_request_hash
      or v_usage.model is distinct from p_model then
      return jsonb_build_object('allowed',false,'reason','conflict');
    end if;
    return jsonb_build_object('allowed',true,'reserved',false,'status',v_usage.status);
  end if;
  select limite_ai_mese into v_limit from public.plans where id=v_plan for share;
  if not found or v_limit<0 then return jsonb_build_object('allowed',false,'reason','unavailable'); end if;
  v_month := date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  select count(*)::integer into v_count from public.ai_usage
    where company_id=p_company_id and created_at>=v_month
      and created_at<((v_month at time zone 'UTC')+interval '1 month') at time zone 'UTC';
  if v_limit is not null and v_count>=v_limit then
    return jsonb_build_object('allowed',false,'reason','quota','limit',v_limit);
  end if;
  insert into public.ai_usage(company_id,request_id,actor_id,request_hash,model,status)
    values(p_company_id,p_request_id,p_actor_id,p_request_hash,p_model,'pending');
  return jsonb_build_object('allowed',true,'reserved',true,'status','pending');
end; $$;

create or replace function public.finish_ai_attempt(
  p_company_id uuid,p_actor_id uuid,p_request_id uuid,p_status text,p_provider_status integer default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
  if p_status is null or p_status not in ('succeeded','failed','unknown')
    or (p_provider_status is not null and (p_provider_status<100 or p_provider_status>599)) then
    raise exception 'invalid AI outcome';
  end if;
  select status into v_status from public.ai_usage where company_id=p_company_id and request_id=p_request_id
    and actor_id=p_actor_id for update;
  if not found then raise exception 'AI reservation unavailable'; end if;
  if v_status=p_status then return; end if;
  if v_status<>'pending' then raise exception 'AI outcome already recorded'; end if;
  update public.ai_usage set status=p_status,provider_status=p_provider_status,finished_at=now()
    where company_id=p_company_id and request_id=p_request_id;
end; $$;
revoke all on function public.reserve_ai_attempt(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.finish_ai_attempt(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_attempt(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.finish_ai_attempt(uuid,uuid,uuid,text,integer) to service_role;

create or replace function public.count_ai_usage_this_month(p_company_id uuid)
returns integer language plpgsql stable security definer set search_path='' as $$
declare v_month timestamptz;
begin
  if not public.is_member(p_company_id) then raise exception 'non fai parte di questa azienda'; end if;
  v_month:=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC';
  return(select count(*)::integer from public.ai_usage where company_id=p_company_id
    and created_at>=v_month and created_at<((v_month at time zone 'UTC')+interval '1 month') at time zone 'UTC');
end; $$;
notify pgrst,'reload schema';
