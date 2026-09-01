-- ============================================================================
-- 0009 — Magazzino: depositi e giacenze
--
-- Fino a qui il "Catalogo" (prodotti) teneva solo anagrafica e prezzi — non
-- esisteva NESSUNA giacenza da nessuna parte, a differenza di quello che
-- offrono i gestionali PMI più diffusi (Danea Easyfatt, Fatture in Cloud:
-- vedi lo "Studio: parità funzionale"). Prima di poter parlare di
-- "multi-deposito" serviva costruire la giacenza vera e propria — un solo
-- deposito è comunque un deposito.
--
-- Un movimento (carico/scarico/rettifica) è un fatto immutabile, come una
-- riga di prima nota: non si aggiorna né si cancella un movimento sbagliato,
-- se ne registra un altro di segno opposto (una rettifica). La giacenza non
-- è mai una colonna salvata da tenere sincronizzata a mano: è sempre la
-- somma di tutti i movimenti di quel prodotto in quel deposito, calcolata
-- al volo dalla vista "giacenze" qui sotto — non può mai andare fuori
-- sincrono con la sua storia.
--
-- Deliberatamente NON automatico: creare un DDT o una fattura fornitore non
-- genera ancora un movimento da solo (lo fanno Danea/Fatture in Cloud). Un
-- passo in più, rimandato apposta: richiede scegliere un deposito su OGNI
-- documento esistente e gestire con cura le modifiche/cancellazioni per non
-- contare due volte lo stesso movimento — prima serve che qualcuno usi
-- davvero i movimenti manuali, poi si automatizza.
-- ============================================================================

create table depositi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  nome text not null,
  predefinito boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table depositi is 'Sedi/depositi fisici di un''azienda. Ogni azienda nuova parte senza nessuno: la prima pagina che apre Magazzino ne crea uno "Sede principale" al volo (store.ensureDefaultDeposito), non un trigger lato database.';

-- Al massimo un deposito predefinito per azienda (il fallback preselezionato
-- nei moduli di movimento) — vincolo vero, non solo una convenzione lato
-- client.
create unique index idx_depositi_predefinito_unico on depositi (company_id) where predefinito;
create index idx_depositi_company on depositi (company_id);

alter table depositi enable row level security;
create policy "membri leggono i depositi della propria azienda" on depositi for select using (is_member(company_id));
create policy "membri non-viewer creano depositi" on depositi for insert with check (is_member(company_id) and not is_viewer_only(company_id));
create policy "membri non-viewer rinominano depositi" on depositi for update using (is_member(company_id) and not is_viewer_only(company_id));
create policy "admin cancella un deposito" on depositi for delete using (is_admin(company_id));

create table movimenti_magazzino (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  prodotto_id uuid not null references prodotti(id) on delete cascade,
  deposito_id uuid not null references depositi(id) on delete restrict,
  tipo text not null check (tipo in ('carico','scarico','rettifica')),
  -- Con segno: positiva = aumenta la giacenza, negativa = la riduce. Il
  -- vincolo sotto impedisce di registrare un "carico" negativo o uno
  -- "scarico" positivo per errore — una "rettifica" può avere entrambi i
  -- segni (serve proprio a correggere in un verso o nell'altro).
  quantita numeric(12,3) not null check (quantita <> 0),
  causale text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint segno_coerente_col_tipo check (
    (tipo = 'carico' and quantita > 0) or
    (tipo = 'scarico' and quantita < 0) or
    (tipo = 'rettifica')
  )
);

comment on table movimenti_magazzino is 'Storico immutabile dei movimenti di magazzino, come una prima nota: un errore si corregge con un''altra riga di segno opposto, non modificando o cancellando quella sbagliata (niente policy di update/delete apposta).';

create index idx_movimenti_company on movimenti_magazzino (company_id);
create index idx_movimenti_prodotto on movimenti_magazzino (prodotto_id);
create index idx_movimenti_deposito on movimenti_magazzino (deposito_id);

alter table movimenti_magazzino enable row level security;
create policy "membri leggono i movimenti della propria azienda" on movimenti_magazzino for select using (is_member(company_id));
create policy "membri non-viewer registrano movimenti" on movimenti_magazzino for insert with check (is_member(company_id) and not is_viewer_only(company_id));
-- Deliberatamente nessuna policy di update/delete: un movimento, una volta
-- registrato, resta per sempre — vedi il commento sulla tabella.

-- ---------------------------------------------------------------------------
-- giacenze: la giacenza corrente di ogni prodotto in ogni deposito dove ha
-- almeno un movimento, calcolata al volo (mai una colonna da tenere
-- sincronizzata a mano). "security_invoker" perché altrimenti una vista gira
-- coi privilegi di chi l'ha creata (bypassando la RLS di
-- movimenti_magazzino) invece che con quelli di chi la interroga davvero.
-- ---------------------------------------------------------------------------
create view giacenze
  with (security_invoker = true)
  as
  select company_id, prodotto_id, deposito_id, sum(quantita) as giacenza
  from movimenti_magazzino
  group by company_id, prodotto_id, deposito_id;

comment on view giacenze is 'Giacenza corrente per prodotto e deposito — somma di movimenti_magazzino, mai una colonna salvata. Un prodotto senza righe qui ha semplicemente giacenza zero in quel deposito.';
