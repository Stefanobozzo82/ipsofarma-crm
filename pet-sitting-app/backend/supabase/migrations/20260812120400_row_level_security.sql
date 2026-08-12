-- RLS per la superficie API "auth + profili" (Fase 2). Le operazioni admin
-- (approvazione sitter, moderazione, dispute) passano dal backend Express
-- con la service role key, che bypassa RLS by design — non servono policy
-- admin qui: vedi backend/src/lib/supabase.ts.

alter table public.users enable row level security;
alter table public.owner_profiles enable row level security;
alter table public.sitter_profiles enable row level security;
alter table public.pets enable row level security;
alter table public.verification_documents enable row level security;

-- users: ognuno legge/modifica solo la propria riga; i profili dei sitter
-- approvati sono leggibili da chiunque sia autenticato (nome/foto in ricerca
-- e nei risultati pubblici).
create policy "users_select_self" on public.users
  for select using (auth.uid() = id);

create policy "users_select_approved_sitters" on public.users
  for select using (
    exists (
      select 1 from public.sitter_profiles sp
      where sp.user_id = users.id and sp.status = 'approved'
    )
  );

create policy "users_update_self" on public.users
  for update using (auth.uid() = id);

-- owner_profiles: privato, solo il proprietario.
create policy "owner_profiles_owner_access" on public.owner_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sitter_profiles: il sitter gestisce il proprio profilo; i profili
-- approvati sono pubblici in lettura (ricerca, pagina pubblica sitter).
create policy "sitter_profiles_self_access" on public.sitter_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sitter_profiles_public_read_approved" on public.sitter_profiles
  for select using (status = 'approved');

-- pets: solo il proprietario vede/gestisce i propri animali.
create policy "pets_owner_access" on public.pets
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- verification_documents: solo il sitter che ha caricato il documento.
create policy "verification_documents_owner_access" on public.verification_documents
  for all using (auth.uid() = sitter_id) with check (auth.uid() = sitter_id);
