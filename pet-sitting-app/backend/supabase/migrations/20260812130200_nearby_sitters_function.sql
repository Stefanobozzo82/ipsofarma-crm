-- Ricerca sitter per raggio geografico, con i filtri richiesti dal brief
-- (tipo animale, prezzo, disponibilità, valutazione). SECURITY DEFINER: gira
-- con i permessi del proprietario della funzione, quindi legge oltre le
-- policy RLS "self access" senza bisogno che il chiamante sia autenticato —
-- ma il filtro `sp.status = 'approved'` dentro alla funzione stessa
-- garantisce che restino visibili solo gli stessi dati che le policy
-- "..._public_read_approved" già espongono via PostgREST diretto.
create or replace function public.nearby_sitters(
  p_lat double precision,
  p_lng double precision,
  p_service public.service_type,
  p_radius_km integer default 15,
  p_species public.pet_species default null,
  p_date date default null,
  p_min_rating numeric default null,
  p_max_price numeric default null
)
returns table (
  sitter_id uuid,
  first_name text,
  avatar_url text,
  city text,
  bio text,
  average_rating numeric,
  review_count integer,
  distance_km double precision,
  price numeric,
  price_unit public.price_unit
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sp.user_id as sitter_id,
    u.first_name,
    u.avatar_url,
    u.city,
    sp.bio,
    sp.average_rating,
    sp.review_count,
    st_distance(sp.base_location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0 as distance_km,
    ss.price,
    ss.price_unit
  from public.sitter_profiles sp
  join public.users u on u.id = sp.user_id
  join public.sitter_services ss on ss.sitter_id = sp.user_id and ss.is_active and ss.service_type = p_service
  where sp.status = 'approved'
    and sp.base_location is not null
    and st_dwithin(sp.base_location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000)
    and (p_species is null or p_species = any (sp.accepted_species))
    and (p_min_rating is null or sp.average_rating >= p_min_rating)
    and (p_max_price is null or ss.price <= p_max_price)
    and (
      p_date is null
      or (
        exists (
          select 1 from public.sitter_availability sa
          where sa.sitter_id = sp.user_id
            and sa.day_of_week = extract(dow from p_date)::smallint
            and (sa.service_type is null or sa.service_type = p_service)
        )
        and not exists (
          select 1 from public.availability_exceptions ae
          where ae.sitter_id = sp.user_id and ae.date = p_date and ae.is_available = false
        )
      )
    )
  order by distance_km asc;
$$;

grant execute on function public.nearby_sitters to anon, authenticated;
