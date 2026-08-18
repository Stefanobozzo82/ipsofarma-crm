-- Servizi offerti, disponibilità e filtro specie accettate: la base per la
-- ricerca geografica (vedi 20260812130200_nearby_sitters_function.sql).

create type public.service_type as enum ('dog_walking', 'boarding', 'house_sitting', 'drop_in', 'day_care');
create type public.price_unit as enum ('per_walk', 'per_hour', 'per_night', 'per_day', 'per_visit');

-- Specie di animali che il sitter accetta — filtro di ricerca richiesto dal
-- brief ("filtri: tipo animale, prezzo, disponibilità, valutazione").
alter table public.sitter_profiles
  add column accepted_species public.pet_species[] not null default array['dog']::public.pet_species[];

-- Un sitter offre al più un listino per tipo di servizio (upsert su
-- sitter_id + service_type dal backend, che sostituisce l'intero set ad
-- ogni PUT /sitters/me/services).
create table public.sitter_services (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.sitter_profiles (user_id) on delete cascade,
  service_type public.service_type not null,
  price numeric(8, 2) not null check (price > 0),
  price_unit public.price_unit not null,
  -- durata tipica in minuti, rilevante per passeggiate/visite; null per boarding/house sitting/day care.
  duration_minutes integer,
  max_pets integer not null default 1 check (max_pets >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sitter_id, service_type)
);

create trigger sitter_services_set_updated_at
  before update on public.sitter_services
  for each row execute function public.set_updated_at();

create index sitter_services_sitter_id_idx on public.sitter_services (sitter_id);
create index sitter_services_type_idx on public.sitter_services (service_type) where is_active;

-- Disponibilità ricorrente settimanale. day_of_week segue la convenzione
-- Postgres EXTRACT(dow from date): 0 = domenica ... 6 = sabato.
-- service_type null = fascia valida per tutti i servizi offerti dal sitter.
create table public.sitter_availability (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.sitter_profiles (user_id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  service_type public.service_type,
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

create index sitter_availability_sitter_id_idx on public.sitter_availability (sitter_id);
create index sitter_availability_dow_idx on public.sitter_availability (sitter_id, day_of_week);

-- Eccezioni puntuali: blocca una data normalmente disponibile
-- (is_available = false, es. ferie) o segnala una disponibilità aggiuntiva
-- fuori dal pattern settimanale (is_available = true).
create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.sitter_profiles (user_id) on delete cascade,
  date date not null,
  is_available boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (sitter_id, date)
);

create index availability_exceptions_sitter_date_idx on public.availability_exceptions (sitter_id, date);
