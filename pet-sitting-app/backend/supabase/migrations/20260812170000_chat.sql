-- Chat in-app: a differenza del resto dello schema, qui il mobile parla
-- DIRETTAMENTE con Supabase (client + Realtime), non attraverso il backend
-- Express. Non c'è logica di business da applicare (niente prezzi, niente
-- Stripe) — la RLS sotto è l'unica autorizzazione necessaria, lo stesso
-- principio già usato per auth (vedi backend/src/modules/auth/auth.service.ts).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  sitter_id uuid not null references public.sitter_profiles (user_id) on delete cascade,
  -- ultima prenotazione associata, solo informativo: la conversazione è
  -- per coppia owner/sitter, non per prenotazione, e sopravvive a più
  -- prenotazioni con lo stesso sitter.
  booking_id uuid references public.bookings (id),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, sitter_id)
);

create index conversations_owner_id_idx on public.conversations (owner_id);
create index conversations_sitter_id_idx on public.conversations (sitter_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.users (id),
  body text not null,
  attachment_url text,
  attachment_type text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id, created_at);

create or replace function public.touch_conversation_last_message()
returns trigger as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_last_message();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "conversations_participants_access" on public.conversations
  for all using (auth.uid() = owner_id or auth.uid() = sitter_id)
  with check (auth.uid() = owner_id or auth.uid() = sitter_id);

create policy "messages_participants_read" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (c.owner_id = auth.uid() or c.sitter_id = auth.uid())
    )
  );

create policy "messages_participants_insert" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and (c.owner_id = auth.uid() or c.sitter_id = auth.uid())
    )
  );

-- Senza questa policy un sitter non potrebbe mai leggere il nome del
-- proprietario con cui sta chattando: "users_select_approved_sitters"
-- (Fase 2) copre solo la direzione owner→sitter. Simmetrica e scoped solo
-- a chi ha già una conversazione in corso, non un accesso generale.
create policy "users_select_conversation_partners" on public.users
  for select using (
    exists (
      select 1 from public.conversations c
      where (c.owner_id = users.id and c.sitter_id = auth.uid())
         or (c.sitter_id = users.id and c.owner_id = auth.uid())
    )
  );

-- Abilita Supabase Realtime sulle due tabelle — senza questo, le
-- sottoscrizioni lato client (supabase.channel(...).on('postgres_changes', ...))
-- non ricevono eventi nonostante la RLS sia corretta.
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
