-- Serialize all client membership/invitation mutations on the company row.
-- Existing invitations are not rewritten: their expiry is created_at + 7 days.
alter table public.invites add column expires_at timestamptz;
alter table public.invites alter column expires_at set default (now() + interval '7 days');

revoke all privileges on public.memberships, public.invites from public, anon, authenticated;
do $$
declare t text; cols text;
begin
  foreach t in array array['memberships','invites'] loop
    select string_agg(quote_ident(attname),',') into cols from pg_attribute
      where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke all privileges (%s) on public.%I from public, anon, authenticated',cols,t);
  end loop;
end;
$$;
grant select on public.memberships, public.invites to authenticated;
-- The original RLS still limits reads. Registration/RPC owners retain writes.
-- Custom inherited grants cannot be safely revoked here: fail visibly instead
-- of declaring the table protected while another role still grants writes.
do $$
declare t text; r text; c text;
begin
  foreach t in array array['memberships','invites'] loop
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r,'public.'||t,'INSERT') or has_table_privilege(r,'public.'||t,'UPDATE')
        or has_table_privilege(r,'public.'||t,'DELETE') or has_table_privilege(r,'public.'||t,'TRUNCATE') then
        raise exception 'unexpected inherited write privilege for % on %',r,t;
      end if;
      for c in select attname from pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped loop
        if has_column_privilege(r,'public.'||t,c,'INSERT') or has_column_privilege(r,'public.'||t,c,'UPDATE') then
          raise exception 'unexpected inherited column privilege for % on %.%',r,t,c;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

create function public.lock_membership_capacity(p_company_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_piano text; v_limit integer;
begin
  -- Serialize capacity/role managers without blocking FK KEY SHARE acquired by
  -- document transactions already holding a membership SHARE lock. A stronger
  -- company FOR UPDATE would invert those locks and permit a deadlock.
  select c.piano into v_piano from public.companies c where c.id=p_company_id for no key update;
  if not found then raise exception 'azienda non disponibile'; end if;
  select p.limite_utenti into v_limit from public.plans p where p.id=v_piano;
  if not found then raise exception 'piano aziendale non disponibile'; end if;
  return v_limit;
end;
$$;
revoke all on function public.lock_membership_capacity(uuid) from public,anon,authenticated;

create or replace function public.create_invite(p_company_id uuid,p_email text,p_role text default 'operatore')
returns public.invites language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_email text:=lower(trim(p_email)); v_limit integer; v_count bigint; v_invite public.invites;
begin
  if v_uid is null then raise exception 'accesso richiesto'; end if;
  v_limit:=public.lock_membership_capacity(p_company_id);
  if not public.is_admin(p_company_id) then raise exception 'solo un amministratore può invitare'; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email non valida'; end if;
  if p_role is null or p_role not in ('admin','operatore','viewer') then raise exception 'ruolo non valido'; end if;
  if exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id
    where m.company_id=p_company_id and lower(trim(u.email))=v_email) then raise exception 'utente già membro'; end if;
  if exists(select 1 from public.invites i where i.company_id=p_company_id and lower(trim(i.email))=v_email
    and i.accepted_at is null and coalesce(i.expires_at,i.created_at+interval '7 days')>now()) then
    raise exception 'invito già in sospeso per questo indirizzo';
  end if;
  select count(*) into v_count from public.memberships m where m.company_id=p_company_id;
  v_count:=v_count+(select count(*) from public.invites i where i.company_id=p_company_id
    and i.accepted_at is null and coalesce(i.expires_at,i.created_at+interval '7 days')>now());
  if v_limit is not null and v_count>=v_limit then raise exception 'limite utenti del piano raggiunto'; end if;
  insert into public.invites(company_id,email,role,created_by)
    values(p_company_id,v_email,p_role,v_uid) returning * into v_invite;
  return v_invite;
end;
$$;

create or replace function public.accept_invite(p_token uuid)
returns table(company_id uuid,company_nome text,role text)
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_email text; v_verified timestamptz; v_company uuid;
  v_invite public.invites; v_limit integer; v_count bigint; v_existing text;
begin
  if v_uid is null then raise exception 'accesso richiesto'; end if;
  select u.email,u.email_confirmed_at into v_email,v_verified from auth.users u where u.id=v_uid;
  if v_email is null or trim(v_email)='' or v_verified is null then raise exception 'conferma il tuo indirizzo email prima di accettare'; end if;
  -- Read identity first; take company lock before any invitation/member lock.
  select i.company_id into v_company from public.invites i where i.token=p_token;
  if not found then raise exception 'invito non valido'; end if;
  v_limit:=public.lock_membership_capacity(v_company);
  select * into v_invite from public.invites i where i.token=p_token and i.company_id=v_company for update;
  if not found then raise exception 'invito revocato'; end if;
  if lower(trim(v_email)) is distinct from lower(trim(v_invite.email)) then raise exception 'invito destinato a un altro indirizzo'; end if;
  select m.role into v_existing from public.memberships m where m.company_id=v_company and m.user_id=v_uid;
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by is distinct from v_uid or v_existing is null then raise exception 'invito già utilizzato'; end if;
    return query select c.id,c.nome,v_existing from public.companies c where c.id=v_company;
    return;
  end if;
  if coalesce(v_invite.expires_at,v_invite.created_at+interval '7 days')<=now() then raise exception 'invito scaduto'; end if;
  if v_existing is null then
    select count(*) into v_count from public.memberships m where m.company_id=v_company;
    v_count:=v_count+(select count(*) from public.invites i where i.company_id=v_company
      and i.accepted_at is null and coalesce(i.expires_at,i.created_at+interval '7 days')>now());
    -- Acceptance replaces its reserved seat: capacity does not increase.
    -- Recheck current plan because it may have been downgraded since invitation.
    if v_limit is not null and v_count>v_limit then raise exception 'limite utenti del piano raggiunto'; end if;
    insert into public.memberships(company_id,user_id,role) values(v_company,v_uid,v_invite.role);
    v_existing:=v_invite.role;
  end if;
  -- A pre-existing membership retains its actual role, never the invitation role.
  update public.invites i set accepted_at=now(),accepted_by=v_uid where i.id=v_invite.id;
  return query select c.id,c.nome,v_existing from public.companies c where c.id=v_company;
end;
$$;

create or replace function public.invite_preview(p_token uuid)
returns table(company_nome text,email text,role text)
language sql stable security definer set search_path='' as $$
  select c.nome,i.email,i.role from public.invites i join public.companies c on c.id=i.company_id
  where i.token=p_token and i.accepted_at is null and coalesce(i.expires_at,i.created_at+interval '7 days')>now();
$$;

create function public.update_member_role(p_company_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path='' as $$
declare v_old text;
begin
  if auth.uid() is null then raise exception 'accesso richiesto'; end if;
  perform public.lock_membership_capacity(p_company_id);
  if not public.is_admin(p_company_id) then raise exception 'solo un amministratore può modificare i ruoli'; end if;
  if p_role is null or p_role not in ('admin','operatore','viewer') then raise exception 'ruolo non valido'; end if;
  select m.role into v_old from public.memberships m where m.company_id=p_company_id and m.user_id=p_user_id for update;
  if not found then raise exception 'membro non disponibile'; end if;
  if v_old='admin' and p_role<>'admin' and (select count(*) from public.memberships m where m.company_id=p_company_id and m.role='admin')<=1 then
    raise exception 'non puoi rimuovere l''ultimo amministratore';
  end if;
  update public.memberships m set role=p_role where m.company_id=p_company_id and m.user_id=p_user_id;
end;
$$;

create function public.remove_member(p_company_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_old text;
begin
  if auth.uid() is null then raise exception 'accesso richiesto'; end if;
  perform public.lock_membership_capacity(p_company_id);
  if not public.is_admin(p_company_id) then raise exception 'solo un amministratore può rimuovere membri'; end if;
  select m.role into v_old from public.memberships m where m.company_id=p_company_id and m.user_id=p_user_id for update;
  if not found then raise exception 'membro non disponibile'; end if;
  if v_old='admin' and (select count(*) from public.memberships m where m.company_id=p_company_id and m.role='admin')<=1 then
    raise exception 'non puoi rimuovere l''ultimo amministratore';
  end if;
  delete from public.memberships m where m.company_id=p_company_id and m.user_id=p_user_id;
end;
$$;

create function public.revoke_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_company uuid;
begin
  if auth.uid() is null then raise exception 'accesso richiesto'; end if;
  select i.company_id into v_company from public.invites i where i.id=p_invite_id;
  if not found then raise exception 'invito non disponibile'; end if;
  perform public.lock_membership_capacity(v_company);
  if not public.is_admin(v_company) then raise exception 'solo un amministratore può revocare inviti'; end if;
  delete from public.invites i where i.id=p_invite_id and i.company_id=v_company and i.accepted_at is null;
  if not found then raise exception 'invito già accettato o revocato'; end if;
end;
$$;

revoke all on function public.create_invite(uuid,text,text),public.accept_invite(uuid),
  public.update_member_role(uuid,uuid,text),public.remove_member(uuid,uuid),public.revoke_invite(uuid)
  from public,anon;
grant execute on function public.create_invite(uuid,text,text),public.accept_invite(uuid),
  public.update_member_role(uuid,uuid,text),public.remove_member(uuid,uuid),public.revoke_invite(uuid) to authenticated;
revoke all on function public.invite_preview(uuid) from public;
grant execute on function public.invite_preview(uuid) to anon,authenticated;
notify pgrst,'reload schema';
