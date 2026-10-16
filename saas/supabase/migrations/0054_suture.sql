-- 0054 — Convertitore suture (suture.html)
-- Due tabelle per azienda:
--   suture_equivalenze: una riga per famiglia di filo (es. "PGLA intrecciato")
--     con il nome commerciale di ogni marca;
--   suture_codici: l'archivio dei codici articolo di tutte le marche, con le
--     caratteristiche usate per trovare l'equivalente (tipo = famiglia).
-- Tutti i membri leggono; solo l'admin modifica, come richiesto.

create table suture_equivalenze (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  famiglia text not null,
  ethicon text, bbraun text, assut text, ergon text, corza text,
  ordine integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (company_id, famiglia)
);

create table suture_codici (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  marca text not null check (marca in ('ethicon','bbraun','assut','ergon','corza')),
  codice text not null,
  tipo text,
  usp text,
  curvatura text,
  punta text,
  ago_mm numeric(6,1),
  lung_cm numeric(6,1),
  sigla_ago text,
  descr text,
  prezzo numeric(12,2),
  updated_at timestamptz not null default now(),
  unique (company_id, marca, codice)
);
create index idx_suture_codici_company_tipo on suture_codici (company_id, tipo);

create trigger suture_equivalenze_set_updated_at before update on suture_equivalenze
  for each row execute function set_updated_at();
create trigger suture_codici_set_updated_at before update on suture_codici
  for each row execute function set_updated_at();

alter table suture_equivalenze enable row level security;
create policy "membri leggono le equivalenze suture" on suture_equivalenze for select using (is_member(company_id));
create policy "admin inserisce equivalenze suture" on suture_equivalenze for insert with check (is_admin(company_id));
create policy "admin modifica equivalenze suture" on suture_equivalenze for update using (is_admin(company_id)) with check (is_admin(company_id));
create policy "admin elimina equivalenze suture" on suture_equivalenze for delete using (is_admin(company_id));

alter table suture_codici enable row level security;
create policy "membri leggono i codici suture" on suture_codici for select using (is_member(company_id));
create policy "admin inserisce codici suture" on suture_codici for insert with check (is_admin(company_id));
create policy "admin modifica codici suture" on suture_codici for update using (is_admin(company_id)) with check (is_admin(company_id));
create policy "admin elimina codici suture" on suture_codici for delete using (is_admin(company_id));

grant select, insert, update, delete on suture_equivalenze, suture_codici to authenticated;
