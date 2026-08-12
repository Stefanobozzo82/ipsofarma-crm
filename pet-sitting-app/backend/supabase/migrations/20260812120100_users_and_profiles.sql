-- Identità applicativa e profili owner/sitter.
-- Un utente Supabase Auth (auth.users) ha sempre una riga public.users
-- corrispondente, creata automaticamente alla registrazione. Le capacità di
-- proprietario/sitter derivano dalla presenza di una riga in owner_profiles /
-- sitter_profiles: un utente può avere entrambe (es. chi porta a spasso un
-- cane il lunedì può prenotarne uno il martedì, come su Rover).

create type public.user_role as enum ('user', 'admin');
create type public.sitter_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');

-- Aggiorna updated_at automaticamente su ogni update, riusata da più tabelle.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  phone text,
  first_name text not null default '',
  last_name text not null default '',
  avatar_url text,
  city text,
  region text,
  role public.user_role not null default 'user',
  gdpr_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Popola public.users alla registrazione, leggendo i metadati passati a
-- supabase.auth.signUp({ data: { first_name, last_name, gdpr_consent } }).
create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, email, first_name, last_name, gdpr_consent_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    case
      when (new.raw_user_meta_data ->> 'gdpr_consent')::boolean is true then now()
      else null
    end
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create table public.owner_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  address text,
  latitude double precision,
  longitude double precision,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table public.sitter_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  bio text,
  experience_years integer,
  status public.sitter_status not null default 'pending',
  verification_status public.verification_status not null default 'unverified',
  service_radius_km integer,
  base_latitude double precision,
  base_longitude double precision,
  -- colonna geografica derivata, usata dalla ricerca per raggio in Fase 3.
  base_location geography(point, 4326) generated always as (
    case
      when base_latitude is not null and base_longitude is not null
        then st_setsrid(st_makepoint(base_longitude, base_latitude), 4326)::geography
      else null
    end
  ) stored,
  address text,
  stripe_account_id text,
  stripe_onboarding_complete boolean not null default false,
  average_rating numeric(3, 2),
  review_count integer not null default 0,
  approved_at timestamptz,
  approved_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sitter_profiles_set_updated_at
  before update on public.sitter_profiles
  for each row execute function public.set_updated_at();

create index sitter_profiles_status_idx on public.sitter_profiles (status);
create index sitter_profiles_geo_idx on public.sitter_profiles using gist (base_location);
