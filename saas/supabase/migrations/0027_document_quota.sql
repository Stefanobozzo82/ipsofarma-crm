-- Monthly usage is monotonic: deletion/cancellation never refunds a document.
-- UTC month, server creation timestamp, all nine document tables. No data rewrite.
-- Maintenance with auth.uid() IS NULL intentionally bypasses this enforcement;
-- normal authenticated calls, including SECURITY DEFINER domain RPCs, do not.
create table public.document_monthly_usage (
  company_id uuid not null references public.companies(id) on delete cascade,
  month_start date not null,
  used bigint not null check(used>=0),
  primary key(company_id,month_start)
);
alter table public.document_monthly_usage enable row level security;
revoke all on public.document_monthly_usage from public,anon,authenticated;

create function public.initialize_document_usage(p_company_id uuid,p_month date)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_used bigint; v_part bigint; t text; v_start timestamptz; v_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('document-quota:'||p_company_id::text||':'||p_month::text,0));
  select u.used into v_used from public.document_monthly_usage u where u.company_id=p_company_id and u.month_start=p_month;
  if found then return v_used; end if;
  v_start:=p_month::timestamp at time zone 'UTC';
  v_end:=(p_month+interval '1 month')::timestamp at time zone 'UTC';
  v_used:=0;
  foreach t in array array['preventivi','ordini_cliente','ordini_fornitore','ddt','fatture_cliente',
    'fatture_fornitore','note_credito','note_credito_fornitore','ddt_fornitore'] loop
    execute format('select count(*) from public.%I where company_id=$1 and created_at>=$2 and created_at<$3',t)
      into v_part using p_company_id,v_start,v_end;
    v_used:=v_used+v_part;
  end loop;
  insert into public.document_monthly_usage(company_id,month_start,used) values(p_company_id,p_month,v_used);
  return v_used;
end;
$$;
revoke all on function public.initialize_document_usage(uuid,date) from public,anon,authenticated;

create function public.prepare_document_quota_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' then
    -- Capture a legacy baseline BEFORE the first deletion can reduce it.
    if auth.uid() is not null then
      perform public.initialize_document_usage(old.company_id,(date_trunc('month',now() at time zone 'UTC'))::date);
    end if;
    return old;
  end if;
  if auth.uid() is null then return new; end if;
  perform 1 from public.memberships m where m.company_id=new.company_id and m.user_id=auth.uid()
    and m.role in ('admin','operatore');
  if not found then raise exception 'scrittura documento non autorizzata per questa azienda'; end if;
  if TG_OP='UPDATE' then
    if new.company_id is distinct from old.company_id or new.id is distinct from old.id then
      raise exception 'identità o azienda del documento non modificabile';
    end if;
    -- INSERT ... ON CONFLICT supplies a fresh default timestamp to UPDATE.
    -- Preserve the original for upserts and ordinary updates alike.
    new.created_at:=old.created_at;
  else
    -- Baseline BEFORE rows become visible; AFTER INSERT alone would see all
    -- rows of a multi-row statement and double-count its first bootstrap.
    -- This reserves no usage: ON CONFLICT UPDATE/NOTHING still charges zero.
    perform public.initialize_document_usage(new.company_id,(date_trunc('month',now() at time zone 'UTC'))::date);
    new.created_at:=now();
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_document_quota_write() from public,anon,authenticated;

create function public.enforce_document_quota()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_limit integer; v_used bigint;
  v_month date:=(date_trunc('month',now() at time zone 'UTC'))::date;
begin
  if v_actor is null then return new; end if;
  -- AFTER INSERT runs only for a real inserted row, never ON CONFLICT UPDATE
  -- or DO NOTHING. Raising here rolls back the row and the entire domain RPC.
  v_used:=public.initialize_document_usage(new.company_id,v_month);
  -- Re-read plan after waiting for the quota lock. Unknown plans fail closed.
  select p.limite_documenti_mese into v_limit from public.companies c join public.plans p on p.id=c.piano where c.id=new.company_id;
  if not found then raise exception 'piano aziendale non disponibile'; end if;
  if v_limit is not null and v_used>=v_limit then raise exception 'limite documenti mensili del piano raggiunto'; end if;
  update public.document_monthly_usage set used=used+1 where company_id=new.company_id and month_start=v_month;
  return new;
end;
$$;
revoke all on function public.enforce_document_quota() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['preventivi','ordini_cliente','ordini_fornitore','ddt','fatture_cliente',
    'fatture_fornitore','note_credito','note_credito_fornitore','ddt_fornitore'] loop
    execute format('create trigger document_quota_prepare before insert or update or delete on public.%I for each row execute function public.prepare_document_quota_write()',t);
    execute format('create trigger document_quota_guard after insert on public.%I for each row execute function public.enforce_document_quota()',t);
  end loop;
end;
$$;

create function public.count_documents_this_month(p_company_id uuid)
returns bigint language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_member(p_company_id) then raise exception 'azienda non autorizzata'; end if;
  return public.initialize_document_usage(p_company_id,(date_trunc('month',now() at time zone 'UTC'))::date);
end;
$$;
revoke all on function public.count_documents_this_month(uuid) from public,anon;
grant execute on function public.count_documents_this_month(uuid) to authenticated;
notify pgrst,'reload schema';
