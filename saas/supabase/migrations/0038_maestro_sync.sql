-- Sincronizzazione automatica da Maestro Gold (GenioSoft).
--
-- Un agente sul PC di Maestro invia i file .DBF della cartella dati alla
-- Edge Function maestro-sync, che ne salva i record in maestro_records: una
-- copia grezza, per azienda e per tabella di Maestro, da cui l'import porta
-- i documenti nuovi nel gestionale. Nessuna di queste tabelle è scrivibile
-- dal browser: scrive solo la funzione, con la service role.

create table if not exists public.maestro_sync_keys (
  key_hash text primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  creata_da uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  usata_at timestamptz,
  revocata_at timestamptz
);
create index if not exists maestro_sync_keys_company on public.maestro_sync_keys(company_id);

create table if not exists public.maestro_sync_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tabella text not null,
  stato text not null check (stato in ('in_corso','ok','errore')),
  report jsonb not null default '{}',
  created_at timestamptz not null default now(),
  finito_at timestamptz
);
create index if not exists maestro_sync_runs_company on public.maestro_sync_runs(company_id, created_at desc);

create table if not exists public.maestro_records (
  company_id uuid not null references public.companies(id) on delete cascade,
  tabella text not null,
  chiave text not null,
  hash text not null,
  deleted boolean not null default false,
  dati jsonb not null,
  run_id uuid references public.maestro_sync_runs(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, tabella, chiave)
);

alter table public.maestro_sync_keys enable row level security;
alter table public.maestro_sync_runs enable row level security;
alter table public.maestro_records enable row level security;

-- Le chiavi non si leggono mai dal browser (nemmeno l'hash).
drop policy if exists "membri leggono sincronizzazioni maestro" on public.maestro_sync_runs;
create policy "membri leggono sincronizzazioni maestro" on public.maestro_sync_runs
  for select using (public.is_member(company_id));
drop policy if exists "admin leggono record maestro" on public.maestro_records;
create policy "admin leggono record maestro" on public.maestro_records
  for select using (public.is_admin(company_id));

revoke all on public.maestro_sync_keys from anon, authenticated;
revoke insert, update, delete on public.maestro_sync_runs from anon, authenticated;
revoke insert, update, delete on public.maestro_records from anon, authenticated;

-- Crea una nuova chiave per l'agente e revoca le precedenti dell'azienda.
-- La chiave in chiaro esce solo qui, una volta: nel database resta l'hash.
create or replace function public.create_maestro_sync_key(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
begin
  if auth.uid() is null or not public.is_admin(p_company_id) then
    raise exception 'solo un amministratore dell''azienda può creare la chiave di sincronizzazione';
  end if;
  v_key := 'msk_' || encode(gen_random_bytes(24), 'hex');
  update public.maestro_sync_keys set revocata_at = now()
    where company_id = p_company_id and revocata_at is null;
  insert into public.maestro_sync_keys (key_hash, company_id, creata_da)
    values (encode(digest(v_key, 'sha256'), 'hex'), p_company_id, auth.uid());
  return v_key;
end;
$$;
revoke all on function public.create_maestro_sync_key(uuid) from public, anon;
grant execute on function public.create_maestro_sync_key(uuid) to authenticated;

-- Stato del collegamento per la pagina impostazioni: se esiste una chiave
-- attiva e quando è stata usata l'ultima volta (mai la chiave stessa).
create or replace function public.maestro_sync_status(p_company_id uuid)
returns table (chiave_attiva boolean, creata_at timestamptz, usata_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from maestro_sync_keys k where k.company_id = p_company_id and k.revocata_at is null),
         (select max(created_at) from maestro_sync_keys k where k.company_id = p_company_id and k.revocata_at is null),
         (select max(usata_at) from maestro_sync_keys k where k.company_id = p_company_id and k.revocata_at is null)
  where public.is_member(p_company_id);
$$;
revoke all on function public.maestro_sync_status(uuid) from public, anon;
grant execute on function public.maestro_sync_status(uuid) to authenticated;
