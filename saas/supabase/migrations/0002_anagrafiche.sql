-- ============================================================================
-- 0002 — Anagrafiche: clienti, fornitori, prodotti
--
-- Stessa forma dei campi che il gestionale attuale gia' usa (vedi backup.json:
-- collections "clienti" e "fornitori", e catalogo.json per "prodotti").
-- ============================================================================

create table clienti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tipo text,                 -- 'PG' persona giuridica, 'PF' persona fisica
  nome text not null,
  piva text,
  cf text,
  sdi text,
  pec text,
  split text,                 -- scissione pagamenti: 'si' / 'no'
  esig text,                  -- esigibilita' IVA: 'I' immediata, 'D' differita
  via text, cap text, citta text, prov text,
  pag text, term text,        -- modalita' e termini di pagamento
  iban text,
  ref text, tel text, email text,
  note text,
  dest jsonb not null default '[]'::jsonb,   -- destinazioni di consegna multiple
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table fornitori (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tipo text,
  nome text not null,
  piva text,
  cf text,
  pec text,
  via text, cap text, citta text, prov text,
  pag text, term text,
  iban text,
  ref text, tel text, email text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table prodotti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  cod text not null,          -- codice catalogo interno
  descr text not null,
  fornitore_id uuid references fornitori(id),
  listino_acq numeric(12,4),  -- ultimo prezzo di acquisto noto
  listino_ven numeric(12,4),  -- prezzo di listino vendita
  iva integer,
  unita text,                 -- confezione, pezzo, ecc.
  extra jsonb not null default '{}'::jsonb,   -- campi meno comuni (lotto, note tecniche...)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, cod)
);

comment on table prodotti is 'Catalogo prodotti dell''azienda. Nel gestionale attuale e'' catalogo.json (~21.000 righe condivise): qui ogni azienda ha il proprio catalogo, isolato.';

create index idx_clienti_company on clienti (company_id);
create index idx_fornitori_company on fornitori (company_id);
create index idx_prodotti_company on prodotti (company_id);
create index idx_prodotti_cod on prodotti (company_id, cod);

create trigger clienti_set_updated_at before update on clienti for each row execute function set_updated_at();
create trigger fornitori_set_updated_at before update on fornitori for each row execute function set_updated_at();
create trigger prodotti_set_updated_at before update on prodotti for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — stesso schema per tutte e tre: qualunque membro dell'azienda legge e
-- scrive, solo un admin cancella. Rispecchia il comportamento attuale (una
-- password condivisa da tutta l'azienda); si affina per ruolo nella Fase 1.
-- ---------------------------------------------------------------------------
alter table clienti enable row level security;
alter table fornitori enable row level security;
alter table prodotti enable row level security;

create policy "membri leggono clienti della propria azienda" on clienti
  for select using (is_member(company_id));
create policy "membri non-viewer scrivono clienti" on clienti
  for insert with check (is_member(company_id) and not is_viewer_only(company_id));
create policy "membri non-viewer aggiornano clienti" on clienti
  for update using (is_member(company_id) and not is_viewer_only(company_id));
create policy "admin cancella clienti" on clienti
  for delete using (is_admin(company_id));

create policy "membri leggono fornitori della propria azienda" on fornitori
  for select using (is_member(company_id));
create policy "membri non-viewer scrivono fornitori" on fornitori
  for insert with check (is_member(company_id) and not is_viewer_only(company_id));
create policy "membri non-viewer aggiornano fornitori" on fornitori
  for update using (is_member(company_id) and not is_viewer_only(company_id));
create policy "admin cancella fornitori" on fornitori
  for delete using (is_admin(company_id));

create policy "membri leggono prodotti della propria azienda" on prodotti
  for select using (is_member(company_id));
create policy "membri non-viewer scrivono prodotti" on prodotti
  for insert with check (is_member(company_id) and not is_viewer_only(company_id));
create policy "membri non-viewer aggiornano prodotti" on prodotti
  for update using (is_member(company_id) and not is_viewer_only(company_id));
create policy "admin cancella prodotti" on prodotti
  for delete using (is_admin(company_id));
