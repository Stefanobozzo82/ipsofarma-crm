-- Tracking GPS delle passeggiate e aggiornamenti (foto/nota) durante il
-- servizio. A differenza della chat, qui il calcolo (distanza percorsa)
-- resta lato Express insieme al resto della logica di prenotazione — non
-- c'è lo stesso motivo per bypassarlo che c'era per la chat (nessun
-- calcolo lì, qui sì).

create table public.gps_tracks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- {lat, lng, t}[] — array semplice, non tabella normalizzata: per l'MVP
  -- evita migliaia di righe per passeggiata (vedi docs/PHASE1-PROPOSAL.md).
  points jsonb not null default '[]'::jsonb,
  distance_km numeric(6, 2),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (booking_id)
);

create type public.service_update_type as enum ('start', 'update', 'end');

create table public.service_updates (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  type public.service_update_type not null,
  note text,
  photo_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index service_updates_booking_id_idx on public.service_updates (booking_id, created_at);

alter table public.gps_tracks enable row level security;
alter table public.service_updates enable row level security;

-- gps_tracks: entrambe le parti leggono, solo il sitter assegnato scrive.
create policy "gps_tracks_participants_read" on public.gps_tracks
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = gps_tracks.booking_id and (b.owner_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

create policy "gps_tracks_sitter_write" on public.gps_tracks
  for all using (
    exists (select 1 from public.bookings b where b.id = gps_tracks.booking_id and b.sitter_id = auth.uid())
  )
  with check (
    exists (select 1 from public.bookings b where b.id = gps_tracks.booking_id and b.sitter_id = auth.uid())
  );

create policy "service_updates_participants_read" on public.service_updates
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = service_updates.booking_id and (b.owner_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

create policy "service_updates_sitter_write" on public.service_updates
  for insert with check (
    exists (select 1 from public.bookings b where b.id = service_updates.booking_id and b.sitter_id = auth.uid())
  );

-- Bucket per le foto inviate durante il servizio: privato, scoped alla
-- singola prenotazione via il primo segmento del path ("{bookingId}/file.jpg"),
-- stesso pattern di verification-documents (Fase 2) ma con lettura estesa
-- a entrambe le parti, non solo a chi carica.
insert into storage.buckets (id, name, public)
values ('service-photos', 'service-photos', false)
on conflict (id) do nothing;

create policy "service_photos_sitter_write" on storage.objects
  for insert with check (
    bucket_id = 'service-photos'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1] and b.sitter_id = auth.uid()
    )
  );

create policy "service_photos_participants_read" on storage.objects
  for select using (
    bucket_id = 'service-photos'
    and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1] and (b.owner_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

alter publication supabase_realtime add table public.gps_tracks;
