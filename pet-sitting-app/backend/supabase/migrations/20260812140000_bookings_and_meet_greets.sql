create type public.booking_status as enum (
  'pending_request',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled_by_owner',
  'cancelled_by_sitter',
  'declined',
  'disputed'
);
create type public.payment_status as enum ('pending', 'authorized', 'captured', 'refunded', 'failed');
create type public.meet_greet_status as enum ('requested', 'proposed', 'accepted', 'declined', 'cancelled');

-- Il breakdown di prezzo è salvato in chiaro sulla riga (non ricalcolato a
-- runtime): la commissione mostrata all'owner in fase di prenotazione deve
-- restare identica a quella mostrata in ricevuta anche se in futuro cambia
-- la percentuale di piattaforma — vedi docs/PHASE1-PROPOSAL.md sul motivo
-- ("evitare la percezione di commissione nascosta").
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  sitter_id uuid not null references public.sitter_profiles (user_id) on delete cascade,
  service_type public.service_type not null,
  status public.booking_status not null default 'pending_request',
  start_date date not null,
  end_date date,
  start_time time,
  end_time time,
  quantity numeric(6, 2) not null check (quantity > 0),
  unit_price numeric(8, 2) not null,
  price_unit public.price_unit not null,
  price_total numeric(9, 2) not null,
  platform_fee numeric(9, 2) not null,
  sitter_payout numeric(9, 2) not null,
  currency text not null default 'EUR',
  payment_status public.payment_status not null default 'pending',
  stripe_payment_intent_id text,
  -- preset applicato al momento della prenotazione: se il sitter cambia
  -- policy dopo, le prenotazioni già fatte restano regolate da questa.
  cancellation_policy public.cancellation_policy_type not null,
  notes text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users (id),
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create index bookings_owner_id_idx on public.bookings (owner_id);
create index bookings_sitter_id_idx on public.bookings (sitter_id);
create index bookings_status_idx on public.bookings (status);

create table public.booking_pets (
  booking_id uuid not null references public.bookings (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  primary key (booking_id, pet_id)
);

create table public.meet_greet_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  sitter_id uuid not null references public.sitter_profiles (user_id) on delete cascade,
  proposed_datetime timestamptz not null,
  status public.meet_greet_status not null default 'requested',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger meet_greet_requests_set_updated_at
  before update on public.meet_greet_requests
  for each row execute function public.set_updated_at();

create index meet_greet_requests_owner_id_idx on public.meet_greet_requests (owner_id);
create index meet_greet_requests_sitter_id_idx on public.meet_greet_requests (sitter_id);
