-- Fix di sicurezza prima di introdurre dati Stripe: la policy
-- "sitter_profiles_public_read_approved" (Fase 2) espone l'intera riga di
-- sitter_profiles ai sitter approvati, perché la RLS di Postgres filtra le
-- righe, non le colonne — chiunque abbia la anon key può interrogare
-- direttamente PostgREST bypassando l'API Express. stripe_account_id non è
-- mai stato pensato per essere pubblico, quindi lo spostiamo in una tabella
-- dedicata, privata per costruzione (nessuna policy pubblica, mai).

alter table public.sitter_profiles drop column stripe_account_id;
alter table public.sitter_profiles drop column stripe_onboarding_complete;

create table public.sitter_payment_accounts (
  sitter_id uuid primary key references public.sitter_profiles (user_id) on delete cascade,
  stripe_account_id text,
  stripe_onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sitter_payment_accounts_set_updated_at
  before update on public.sitter_payment_accounts
  for each row execute function public.set_updated_at();

alter table public.sitter_payment_accounts enable row level security;

-- Il sitter può leggere il proprio stato di onboarding. Le scritture
-- (creazione account Connect, aggiornamento da webhook Stripe) passano
-- sempre da supabaseAdmin nel backend — nessuna policy insert/update qui,
-- di proposito.
create policy "sitter_payment_accounts_self_read" on public.sitter_payment_accounts
  for select using (auth.uid() = sitter_id);

-- Politica di cancellazione personalizzabile (3 preset, non regole
-- arbitrarie per-sitter): vedi shared/src/constants/cancellation.ts per il
-- dettaglio dei rimborsi applicati da ciascun preset.
create type public.cancellation_policy_type as enum ('flexible', 'moderate', 'strict');

alter table public.sitter_profiles
  add column cancellation_policy public.cancellation_policy_type not null default 'moderate';
