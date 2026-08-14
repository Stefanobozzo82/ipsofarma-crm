create type public.review_direction as enum ('owner_to_sitter', 'sitter_to_owner');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  reviewee_id uuid not null references public.users (id) on delete cascade,
  direction public.review_direction not null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  -- snapshot del nome al momento della recensione, non un join a users:
  -- un lettore pubblico anonimo può leggere le recensioni owner→sitter ma
  -- non ha accesso in lettura alla riga users del recensore (RLS), quindi
  -- un join fallirebbe silenziosamente invece di dare un errore chiaro.
  reviewer_first_name text not null,
  response text,
  response_at timestamptz,
  created_at timestamptz not null default now(),
  -- una sola recensione per direzione per prenotazione (l'owner recensisce
  -- il sitter una volta, il sitter recensisce l'owner/animale una volta).
  unique (booking_id, direction)
);

create index reviews_reviewee_id_idx on public.reviews (reviewee_id);
create index reviews_booking_id_idx on public.reviews (booking_id);

-- Mantiene sitter_profiles.average_rating/review_count aggiornati ad ogni
-- nuova recensione owner→sitter, stesso pattern denormalizzato già in uso
-- dallo schema (evita di ricalcolare l'aggregato ad ogni lettura del
-- profilo pubblico, che è il percorso più "caldo").
create or replace function public.update_sitter_rating()
returns trigger as $$
begin
  if new.direction = 'owner_to_sitter' then
    update public.sitter_profiles
    set
      average_rating = (
        select avg(rating)::numeric(3, 2) from public.reviews
        where reviewee_id = new.reviewee_id and direction = 'owner_to_sitter'
      ),
      review_count = (
        select count(*) from public.reviews
        where reviewee_id = new.reviewee_id and direction = 'owner_to_sitter'
      )
    where user_id = new.reviewee_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger reviews_update_sitter_rating
  after insert on public.reviews
  for each row execute function public.update_sitter_rating();

alter table public.reviews enable row level security;

-- Le recensioni owner→sitter sono il segnale di fiducia mostrato sul
-- profilo pubblico: leggibili da chiunque. Quelle sitter→owner restano
-- private (non esiste ancora un profilo pubblico del proprietario) —
-- visibili solo a chi le ha scritte o ricevute.
create policy "reviews_public_read_owner_to_sitter" on public.reviews
  for select using (direction = 'owner_to_sitter');

create policy "reviews_private_read_sitter_to_owner" on public.reviews
  for select using (direction = 'sitter_to_owner' and (auth.uid() = reviewer_id or auth.uid() = reviewee_id));

-- Il controllo di merito (prenotazione completata, reviewer/reviewee
-- corretti per la direzione, una sola recensione a testa) è nel backend:
-- qui solo il vincolo minimo che chiunque scriva una recensione la firmi
-- con la propria identità.
create policy "reviews_insert_self" on public.reviews
  for insert with check (auth.uid() = reviewer_id);
