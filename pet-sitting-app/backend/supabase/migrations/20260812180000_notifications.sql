-- Feed di notifiche in-app, pienamente funzionante da subito. L'invio push
-- reale (Firebase Cloud Messaging) richiede un progetto Firebase e
-- credenziali del cliente che non esistono ancora in questo ambiente — le
-- righe create qui sono pronte per essere spinte a un token quando quel
-- pezzo verrà collegato (vedi backend/src/lib/push.ts).

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, token)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  data jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id, created_at desc);

alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;

-- push_tokens: l'utente gestisce i propri token (registrazione da mobile).
create policy "push_tokens_self_access" on public.push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- notifications: solo lettura/aggiornamento (segna come letta) da parte del
-- destinatario. L'inserimento è sempre fatto dal backend (supabaseAdmin) o
-- da un trigger di sistema (vedi sotto per i nuovi messaggi) — mai
-- direttamente dal client, altrimenti chiunque potrebbe notificare
-- chiunque.
create policy "notifications_self_read" on public.notifications
  for select using (auth.uid() = user_id);

create policy "notifications_self_update" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- La chat passa direttamente da Supabase (non da Express, vedi
-- 20260812170000_chat.sql), quindi anche la notifica di un nuovo messaggio
-- va generata qui, non nel backend: un trigger sull'inserimento crea la
-- notifica per il destinatario (l'altro partecipante alla conversazione).
create or replace function public.notify_new_message()
returns trigger as $$
declare
  recipient_id uuid;
  sender_name text;
begin
  select case when c.owner_id = new.sender_id then c.sitter_id else c.owner_id end
    into recipient_id
  from public.conversations c
  where c.id = new.conversation_id;

  select first_name into sender_name from public.users where id = new.sender_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    recipient_id,
    'new_message',
    coalesce(sender_name, 'Nuovo messaggio'),
    left(new.body, 140),
    jsonb_build_object('conversationId', new.conversation_id)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger messages_notify_recipient
  after insert on public.messages
  for each row execute function public.notify_new_message();
