-- ============================================================================
-- 0008 — Inviti in azienda
--
-- Finora l'unico modo per entrare in un'azienda era registrarsene una
-- propria (register_company, Fase 1): non esisteva nessun modo per un
-- admin di far entrare un collega nella PROPRIA. Qui si aggiunge quel
-- varco, con lo stesso principio di register_company — un utente che non
-- è ancora membro non può scrivere memberships da solo, quindi l'unico
-- modo è passare da funzioni server-side dedicate (security definer).
--
-- Deliberatamente senza invio email automatico (servirebbe un provider
-- email configurato, non ancora fatto — vedi "Prossimo passo" nel
-- README): l'admin genera il link e lo manda lui stesso (email, chat,
-- come preferisce). Il link è index.html?invite=<token>.
-- ============================================================================

create table invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  email text not null,
  role text not null default 'operatore' check (role in ('admin','operatore','viewer')),
  token uuid not null default gen_random_uuid() unique,
  created_by uuid not null references auth.users(id),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table invites is 'Inviti in sospeso a entrare in un''azienda. Niente invio email automatico: l''admin condivide il link (index.html?invite=<token>) con chi vuole invitare. Consumato una sola volta da accept_invite().';

create index idx_invites_company on invites (company_id);
create index idx_invites_token on invites (token);

alter table invites enable row level security;

-- Solo lettura/cancellazione dirette per un admin della propria azienda —
-- niente insert/update diretto: quello passa sempre da create_invite()/
-- accept_invite() qui sotto, che applicano il limite del piano e
-- verificano l'email di chi accetta (stessa logica di register_company
-- per companies/memberships in 0001/0005: mai un insert diretto del client
-- per un varco così delicato).
create policy "admin vede gli inviti della propria azienda" on invites
  for select using (is_admin(company_id));

create policy "admin cancella un invito della propria azienda" on invites
  for delete using (is_admin(company_id));

-- ---------------------------------------------------------------------------
-- create_invite: un admin invita un indirizzo email nella propria azienda.
-- Applica qui il limite utenti del piano (plans.limite_utenti) — l'unico
-- posto dove aveva senso applicarlo, visto che è l'unico momento in cui
-- il numero di persone nell'azienda può crescere.
-- ---------------------------------------------------------------------------
create or replace function create_invite(p_company_id uuid, p_email text, p_role text default 'operatore')
returns invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_piano text;
  v_limite int;
  v_count int;
  v_invite invites;
begin
  if v_uid is null then
    raise exception 'devi effettuare l''accesso';
  end if;
  if not is_admin(p_company_id) then
    raise exception 'solo un amministratore può invitare nuovi utenti';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'indirizzo email non valido';
  end if;
  if p_role not in ('admin','operatore','viewer') then
    raise exception 'ruolo non valido';
  end if;
  if exists (
    select 1 from memberships m join auth.users u on u.id = m.user_id
    where m.company_id = p_company_id and lower(u.email) = v_email
  ) then
    raise exception 'questa persona fa già parte dell''azienda';
  end if;
  if exists (select 1 from invites where company_id = p_company_id and email = v_email and accepted_at is null) then
    raise exception 'c''è già un invito in sospeso per questo indirizzo';
  end if;

  select piano into v_piano from companies where id = p_company_id;
  select limite_utenti into v_limite from plans where id = v_piano;
  if v_limite is not null then
    select count(*) into v_count from memberships where company_id = p_company_id;
    v_count := v_count + (select count(*) from invites where company_id = p_company_id and accepted_at is null);
    if v_count >= v_limite then
      raise exception 'Hai raggiunto il limite di % utenti del piano attuale. Passa a un piano superiore per invitarne altri.', v_limite;
    end if;
  end if;

  insert into invites (company_id, email, role, created_by)
  values (p_company_id, v_email, p_role, v_uid)
  returning * into v_invite;

  return v_invite;
end;
$$;

grant execute on function create_invite(uuid, text, text) to authenticated;

comment on function create_invite(uuid, text, text) is
  'Un admin invita un indirizzo email nella propria azienda. Applica il limite utenti del piano. Non manda nessuna email: il chiamante deve condividere lui stesso index.html?invite=<token> (il token è nella riga restituita).';

-- ---------------------------------------------------------------------------
-- invite_preview: dati minimi e non sensibili per mostrare "sei stato
-- invitato da X" PRIMA del login (index.html apre senza sessione) — solo
-- nome azienda, l'email a cui è indirizzato l'invito, il ruolo. Concesso
-- anche ad anon apposta.
-- ---------------------------------------------------------------------------
create or replace function invite_preview(p_token uuid)
returns table (company_nome text, email text, role text)
language sql stable security definer set search_path = public as $$
  select c.nome, i.email, i.role
  from invites i join companies c on c.id = i.company_id
  where i.token = p_token and i.accepted_at is null;
$$;

grant execute on function invite_preview(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- accept_invite: il chiamante DEVE essere autenticato (nuovo account appena
-- creato, o uno già esistente) — funziona per entrambi i casi allo stesso
-- modo, non serve distinguerli lato client. Verifica che l'email del suo
-- account corrisponda a quella dell'invito (altrimenti chiunque trovasse il
-- link potrebbe accettarlo con un account a caso).
-- ---------------------------------------------------------------------------
create or replace function accept_invite(p_token uuid)
returns table (company_id uuid, company_nome text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite invites;
begin
  if v_uid is null then
    raise exception 'devi effettuare l''accesso prima di accettare un invito';
  end if;
  select email into v_email from auth.users where id = v_uid;

  select * into v_invite from invites where token = p_token and accepted_at is null;
  if v_invite is null then
    raise exception 'invito non valido o già usato';
  end if;
  if lower(v_email) <> v_invite.email then
    raise exception 'questo invito è per %, non per %', v_invite.email, v_email;
  end if;

  insert into memberships (company_id, user_id, role)
  values (v_invite.company_id, v_uid, v_invite.role)
  on conflict (company_id, user_id) do update set role = excluded.role;

  update invites set accepted_at = now(), accepted_by = v_uid where id = v_invite.id;

  return query select c.id, c.nome, v_invite.role from companies c where c.id = v_invite.company_id;
end;
$$;

grant execute on function accept_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_members: chi c'è già in azienda, con l'email (memberships non la
-- contiene — vive in auth.users, non leggibile direttamente dal client).
-- Visibile a qualunque membro (vedere i colleghi non è un'azione da soli
-- admin), non solo agli admin.
-- ---------------------------------------------------------------------------
create or replace function list_members(p_company_id uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_member(p_company_id) then
    raise exception 'non fai parte di questa azienda';
  end if;
  return query
    select m.user_id, u.email, m.role, m.created_at
    from memberships m join auth.users u on u.id = m.user_id
    where m.company_id = p_company_id
    order by m.created_at;
end;
$$;

grant execute on function list_members(uuid) to authenticated;
