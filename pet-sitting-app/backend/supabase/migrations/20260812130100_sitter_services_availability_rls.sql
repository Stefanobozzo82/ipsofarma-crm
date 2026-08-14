alter table public.sitter_services enable row level security;
alter table public.sitter_availability enable row level security;
alter table public.availability_exceptions enable row level security;

-- Il sitter gestisce interamente i propri servizi/disponibilità.
create policy "sitter_services_self_access" on public.sitter_services
  for all using (auth.uid() = sitter_id) with check (auth.uid() = sitter_id);

create policy "sitter_availability_self_access" on public.sitter_availability
  for all using (auth.uid() = sitter_id) with check (auth.uid() = sitter_id);

create policy "availability_exceptions_self_access" on public.availability_exceptions
  for all using (auth.uid() = sitter_id) with check (auth.uid() = sitter_id);

-- Lettura pubblica per i sitter approvati: serve alla pagina profilo
-- pubblica (tariffe, servizi) — la ricerca vera e propria passa dalla
-- funzione nearby_sitters(), definita SECURITY DEFINER e quindi non
-- soggetta a queste policy.
create policy "sitter_services_public_read_approved" on public.sitter_services
  for select using (
    is_active
    and exists (
      select 1 from public.sitter_profiles sp
      where sp.user_id = sitter_services.sitter_id and sp.status = 'approved'
    )
  );

create policy "sitter_availability_public_read_approved" on public.sitter_availability
  for select using (
    exists (
      select 1 from public.sitter_profiles sp
      where sp.user_id = sitter_availability.sitter_id and sp.status = 'approved'
    )
  );
