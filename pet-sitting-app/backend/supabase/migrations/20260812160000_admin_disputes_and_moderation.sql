create type public.dispute_status as enum ('open', 'investigating', 'resolved', 'closed');

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  opened_by uuid not null references public.users (id),
  reason text not null,
  description text,
  status public.dispute_status not null default 'open',
  resolution text,
  resolved_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index disputes_booking_id_idx on public.disputes (booking_id);
create index disputes_status_idx on public.disputes (status);

-- Audit trail delle azioni di moderazione — scritto solo dal backend con
-- supabaseAdmin quando un admin approva/rifiuta un sitter, modera una
-- recensione o risolve una dispute.
create table public.admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users (id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  notes text,
  created_at timestamptz not null default now()
);

create index admin_action_logs_target_idx on public.admin_action_logs (target_type, target_id);

-- Moderazione recensioni: nasconde senza cancellare (l'admin può sempre
-- tornare sulla decisione, e il rating aggregato del sitter non si
-- ricalcola da solo togliendo la riga — vedi update_sitter_rating()).
alter table public.reviews add column is_hidden boolean not null default false;

drop policy if exists "reviews_public_read_owner_to_sitter" on public.reviews;
create policy "reviews_public_read_owner_to_sitter" on public.reviews
  for select using (direction = 'owner_to_sitter' and not is_hidden);

-- update_sitter_rating() (definita in 20260812150000_reviews.sql) va
-- rifatta per escludere le recensioni nascoste dall'aggregato, e serve un
-- secondo trigger che scatti quando un admin nasconde/ripristina una
-- recensione — il trigger originale copre solo l'inserimento.
create or replace function public.update_sitter_rating()
returns trigger as $$
declare
  target_reviewee uuid;
begin
  target_reviewee := coalesce(new.reviewee_id, old.reviewee_id);

  if coalesce(new.direction, old.direction) = 'owner_to_sitter' then
    update public.sitter_profiles
    set
      average_rating = (
        select avg(rating)::numeric(3, 2) from public.reviews
        where reviewee_id = target_reviewee and direction = 'owner_to_sitter' and not is_hidden
      ),
      review_count = (
        select count(*) from public.reviews
        where reviewee_id = target_reviewee and direction = 'owner_to_sitter' and not is_hidden
      )
    where user_id = target_reviewee;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger reviews_update_sitter_rating_on_moderation
  after update of is_hidden on public.reviews
  for each row execute function public.update_sitter_rating();

alter table public.disputes enable row level security;
alter table public.admin_action_logs enable row level security;

-- disputes: i partecipanti alla prenotazione vedono/aprono la dispute;
-- solo il backend (supabaseAdmin) la aggiorna in fase di risoluzione.
create policy "disputes_participants_read" on public.disputes
  for select using (
    exists (
      select 1 from public.bookings b
      where b.id = disputes.booking_id and (b.owner_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

create policy "disputes_participants_insert" on public.disputes
  for insert with check (
    auth.uid() = opened_by
    and exists (
      select 1 from public.bookings b
      where b.id = disputes.booking_id and (b.owner_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

-- admin_action_logs: nessuna policy di lettura per utenti normali — solo
-- supabaseAdmin (bypassa RLS) vi accede, dal pannello admin.
