create type public.payment_type as enum ('charge', 'refund');
create type public.payout_status as enum ('pending', 'paid', 'failed');

-- Log delle transazioni Stripe legate a una prenotazione. Scritto solo dal
-- backend (webhook o azione admin) con supabaseAdmin — mai da un client
-- scoped all'utente, quindi nessuna policy insert/update qui di proposito.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  type public.payment_type not null,
  amount numeric(9, 2) not null,
  currency text not null default 'EUR',
  stripe_object_id text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create index payments_booking_id_idx on public.payments (booking_id);

-- Storico dei payout Stripe Connect (Account → banca del sitter). Scritto
-- solo dal backend: la richiesta di payout passa dalla secret key della
-- piattaforma con l'header Stripe-Account, non da un client utente.
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.sitter_profiles (user_id) on delete cascade,
  amount numeric(9, 2) not null,
  currency text not null default 'EUR',
  stripe_payout_id text,
  status public.payout_status not null default 'pending',
  requested_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payouts_sitter_id_idx on public.payouts (sitter_id);

alter table public.bookings enable row level security;
alter table public.booking_pets enable row level security;
alter table public.meet_greet_requests enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;

-- bookings: entrambe le parti vedono e possono aggiornare la prenotazione
-- (accept/decline/cancel sono update fatti dall'una o dall'altra); solo il
-- proprietario può crearla.
create policy "bookings_participants_read" on public.bookings
  for select using (auth.uid() = owner_id or auth.uid() = sitter_id);

create policy "bookings_owner_insert" on public.bookings
  for insert with check (auth.uid() = owner_id);

create policy "bookings_participants_update" on public.bookings
  for update using (auth.uid() = owner_id or auth.uid() = sitter_id);

create policy "booking_pets_participants_read" on public.booking_pets
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_pets.booking_id and (b.owner_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

create policy "booking_pets_owner_insert" on public.booking_pets
  for insert with check (
    exists (select 1 from public.bookings b where b.id = booking_pets.booking_id and b.owner_id = auth.uid())
  );

-- meet_greet_requests: stessa logica di bookings.
create policy "meet_greets_participants_read" on public.meet_greet_requests
  for select using (auth.uid() = owner_id or auth.uid() = sitter_id);

create policy "meet_greets_owner_insert" on public.meet_greet_requests
  for insert with check (auth.uid() = owner_id);

create policy "meet_greets_participants_update" on public.meet_greet_requests
  for update using (auth.uid() = owner_id or auth.uid() = sitter_id);

-- payments: solo lettura per i partecipanti alla prenotazione.
create policy "payments_participants_read" on public.payments
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id and (b.owner_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

-- payouts: il sitter legge il proprio storico.
create policy "payouts_self_read" on public.payouts
  for select using (auth.uid() = sitter_id);
