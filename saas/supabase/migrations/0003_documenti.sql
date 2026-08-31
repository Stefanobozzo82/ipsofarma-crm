-- ============================================================================
-- 0003 — Documenti: preventivi, ordini, DDT, fatture, note di credito
--
-- Ogni tabella ha una manciata di colonne reali (per gli indici, i vincoli di
-- unicita' del numero, i collegamenti tra documenti) piu' una colonna "righe"
-- in JSON, con la stessa identica forma che il gestionale gia' produce oggi:
-- {cod, descr, qty, prezzo, sconto, iva, lotto, scad}.
--
-- Perche' non normalizzare anche le righe in una tabella a parte? Perche' le
-- funzioni che oggi calcolano totali, IVA e scissione dei pagamenti lavorano
-- gia' su array fatti cosi': tenerli JSON riduce al minimo le modifiche alla
-- logica quando, nella Fase 2, il gestionale iniziera' a parlare con questo
-- database invece che con GitHub.
--
-- "extra" e' una valvola di sicurezza: qualunque campo meno comune, non
-- ancora promosso a colonna, ci finisce dentro senza perdere dati.
-- ============================================================================

create table preventivi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  cliente_id uuid references clienti(id) on delete set null,
  righe jsonb not null default '[]'::jsonb,
  note text,
  oc_id uuid,                                   -- valorizzato quando il preventivo diventa ordine
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

create table ordini_cliente (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  cliente_id uuid not null references clienti(id),
  righe jsonb not null default '[]'::jsonb,
  prev_id uuid references preventivi(id) on delete set null,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

create table ordini_fornitore (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  fornitore_id uuid not null references fornitori(id),
  righe jsonb not null default '[]'::jsonb,      -- ogni riga puo' includere qtyEv (quantita' evasa)
  ftf_ids jsonb not null default '[]'::jsonb,     -- id delle fatture fornitore collegate
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

create table ddt (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  cliente_id uuid not null references clienti(id),
  oc_id uuid references ordini_cliente(id) on delete set null,
  righe jsonb not null default '[]'::jsonb,
  dest_id text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

create table fatture_cliente (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  cliente_id uuid not null references clienti(id),
  ddt_id uuid references ddt(id) on delete set null,
  oc_id uuid references ordini_cliente(id) on delete set null,
  righe jsonb not null default '[]'::jsonb,
  paid boolean not null default false,
  paid_date date,
  pagamenti jsonb not null default '[]'::jsonb,   -- storico incassi: [{data, importo}]
  dest_id text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

create table fatture_fornitore (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  fornitore_id uuid not null references fornitori(id),
  of_id uuid references ordini_fornitore(id) on delete set null,
  righe jsonb not null default '[]'::jsonb,
  paid boolean not null default false,
  paid_date date,
  pagamenti jsonb not null default '[]'::jsonb,   -- storico pagamenti: [{data, importo}]
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

create table note_credito (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  cliente_id uuid not null references clienti(id),
  fattura_id uuid references fatture_cliente(id) on delete set null,
  righe jsonb not null default '[]'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

create table note_credito_fornitore (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  fornitore_id uuid not null references fornitori(id),
  fattura_id uuid references fatture_fornitore(id) on delete set null,
  righe jsonb not null default '[]'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

-- preventivi.oc_id non poteva referenziare ordini_cliente al momento della sua
-- creazione (la tabella non esisteva ancora): il vincolo si aggiunge qui.
alter table preventivi
  add constraint preventivi_oc_id_fkey foreign key (oc_id) references ordini_cliente(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Indici: ogni query del gestionale filtra sempre per azienda, quasi sempre
-- ordinando per data o cercando per numero — questi coprono entrambi i casi.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['preventivi','ordini_cliente','ordini_fornitore','ddt',
                            'fatture_cliente','fatture_fornitore','note_credito','note_credito_fornitore']
  loop
    execute format('create index idx_%1$s_company_data on %1$I (company_id, data desc)', t);
    execute format('create trigger %1$s_set_updated_at before update on %1$I for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS: stessa regola per tutte le tabelle documento, generata una sola volta
-- invece di ripetere 4 policy per 8 tabelle a mano.
--   - qualunque membro legge i documenti della propria azienda
--   - chi non e' "viewer" puo' creare e modificare
--   - solo un admin puo' cancellare (annullare un documento fiscale non e'
--     un'operazione qualunque)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['preventivi','ordini_cliente','ordini_fornitore','ddt',
                            'fatture_cliente','fatture_fornitore','note_credito','note_credito_fornitore']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "membri leggono %1$s della propria azienda" on %1$I for select using (is_member(company_id))', t);
    execute format('create policy "membri non-viewer creano %1$s" on %1$I for insert with check (is_member(company_id) and not is_viewer_only(company_id))', t);
    execute format('create policy "membri non-viewer aggiornano %1$s" on %1$I for update using (is_member(company_id) and not is_viewer_only(company_id))', t);
    execute format('create policy "admin cancella %1$s" on %1$I for delete using (is_admin(company_id))', t);
  end loop;
end $$;
