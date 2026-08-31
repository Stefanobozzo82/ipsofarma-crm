-- ============================================================================
-- 0001 — Aziende e utenti
--
-- Il cuore dell'isolamento multi-azienda: ogni riga di dati, in ogni tabella
-- futura, appartiene a una company. Le funzioni is_member()/is_admin() qui
-- sotto sono quello che le policy RLS di TUTTE le tabelle successive useranno
-- per decidere chi vede cosa.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- companies: un'azienda cliente = un abbonamento = uno spazio dati isolato.
-- Corrisponde a quello che oggi in backup.json è il singolo oggetto "azienda",
-- ma qui ce n'è una riga per ogni cliente che compra il prodotto.
-- ---------------------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                    -- es. "farmacia-rossi", usato negli URL
  nome text not null,
  piva text,
  cf text,
  sdi_codice text,                               -- codice destinatario SDI
  pec text,
  indirizzo jsonb not null default '{}'::jsonb,  -- via, cap, citta, prov
  settings jsonb not null default '{}'::jsonb,   -- preferenze non sensibili (provider IA, modello, ecc.)
  piano text not null default 'trial' check (piano in ('trial','base','pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table companies is 'Un''azienda cliente del SaaS: uno spazio dati completamente isolato dalle altre.';
comment on column companies.settings is 'Preferenze non sensibili. Le chiavi API (IA, ecc.) non vivono mai qui: arriveranno nella Fase 3, in una tabella separata leggibile solo dal server.';

-- ---------------------------------------------------------------------------
-- memberships: chi appartiene a quale azienda, con quale ruolo.
-- auth.users è la tabella utenti gestita automaticamente da Supabase Auth.
-- ---------------------------------------------------------------------------
create table memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'operatore' check (role in ('admin','operatore','viewer')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

comment on table memberships is 'Collega un utente Supabase Auth a un''azienda, con un ruolo. Un utente puo'' appartenere a piu'' aziende (es. un commercialista con piu'' clienti).';
comment on column memberships.role is 'admin: accesso completo. operatore: uso quotidiano. viewer: sola lettura, rispecchia isAdmin()/modalita'' sola-lettura gia'' presenti nel gestionale attuale.';

-- ---------------------------------------------------------------------------
-- Funzioni di isolamento — usate da OGNI policy RLS delle tabelle successive.
-- security definer + search_path fisso: evita che vengano aggirate.
-- ---------------------------------------------------------------------------
create or replace function is_member(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.company_id = p_company_id and m.user_id = auth.uid()
  );
$$;

create or replace function is_admin(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.company_id = p_company_id and m.user_id = auth.uid() and m.role = 'admin'
  );
$$;

create or replace function is_viewer_only(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.company_id = p_company_id and m.user_id = auth.uid() and m.role = 'viewer'
  );
$$;

comment on function is_member(uuid) is 'Vero se l''utente collegato appartiene a questa azienda. Base di ogni policy RLS del progetto.';
comment on function is_admin(uuid) is 'Vero se l''utente collegato e'' admin di questa azienda.';

-- ---------------------------------------------------------------------------
-- updated_at automatico, riusato da tutte le tabelle future.
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_set_updated_at
  before update on companies
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table companies enable row level security;
alter table memberships enable row level security;

create policy "membri vedono la propria azienda" on companies
  for select using (is_member(id));

create policy "admin modifica la propria azienda" on companies
  for update using (is_admin(id)) with check (is_admin(id));

create policy "membri vedono i colleghi della propria azienda" on memberships
  for select using (is_member(company_id));

create policy "admin gestisce le utenze della propria azienda" on memberships
  for all using (is_admin(company_id)) with check (is_admin(company_id));

-- Nota: la creazione di una nuova company e del primo membership (admin) va
-- fatta da una funzione server-side dedicata (Fase 1, "registrazione nuova
-- azienda"), non da un insert diretto del client: e' l'unico punto in cui un
-- utente ancora senza membership deve poter scrivere.
