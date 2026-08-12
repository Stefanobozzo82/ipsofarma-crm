create type public.pet_species as enum ('dog', 'cat', 'other');
create type public.pet_sex as enum ('male', 'female');

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  species public.pet_species not null,
  breed text,
  birth_date date,
  weight_kg numeric(5, 2),
  sex public.pet_sex,
  is_neutered boolean,
  photo_url text,
  behavioral_notes text,
  medical_notes text,
  dietary_notes text,
  vet_name text,
  vet_phone text,
  microchip_id text,
  -- soft delete: un animale scomparso da un profilo resta in storico delle
  -- prenotazioni passate, non va rimosso fisicamente.
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pets_set_updated_at
  before update on public.pets
  for each row execute function public.set_updated_at();

create index pets_owner_id_idx on public.pets (owner_id) where deleted_at is null;
