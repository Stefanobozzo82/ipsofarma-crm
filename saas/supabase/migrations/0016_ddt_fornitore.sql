-- ============================================================================
-- 0016 — DDT fornitore: il pezzo mancante nella catena lato acquisti
--
-- Richiesta reale: "sto pensando di implementare anche i ddt del fornitore
-- che mi arrivano soltanto in forma cartacea insieme al pacco. come possiamo
-- caricarli in modo automatico?" — la catena lato cliente è completa (ordine
-- cliente -> DDT -> fattura), quella lato fornitore si fermava a metà
-- (ordine fornitore -> fattura fornitore): il momento in cui si segnava
-- "è arrivata la merce" (qtyEv su ordini_fornitore) coincideva con quando si
-- registrava la fattura del fornitore, non con quando arrivava davvero il
-- pacco — nella realtà il DDT cartaceo arriva SUBITO, la fattura magari
-- settimane dopo (a volte una sola fattura per più DDT).
--
-- Stessa identica forma di "ddt" (0003_documenti.sql), ma verso un fornitore
-- invece che un cliente — senza dest_id: non esiste una "destinazione di
-- consegna" quando la consegna è verso di noi, sempre nello stesso posto.
-- ============================================================================

create table ddt_fornitore (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  num text not null,
  data date not null,
  fornitore_id uuid not null references fornitori(id),
  of_id uuid references ordini_fornitore(id) on delete set null,
  righe jsonb not null default '[]'::jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, num)
);

-- La fattura fornitore ora può collegarsi anche a un DDT fornitore, oltre
-- che (o invece di) direttamente all'ordine — esattamente come
-- fatture_cliente ha sia ddt_id sia oc_id (0003_documenti.sql). of_id
-- resta valorizzabile anche da solo per i fornitori che non mandano un DDT
-- (comportamento di oggi, invariato): non è stato reso obbligatorio passare
-- da un DDT.
alter table fatture_fornitore add column ddtf_id uuid references ddt_fornitore(id) on delete set null;

create index idx_ddt_fornitore_company_data on ddt_fornitore (company_id, data desc);
create trigger ddt_fornitore_set_updated_at before update on ddt_fornitore for each row execute function set_updated_at();

alter table ddt_fornitore enable row level security;
create policy "membri leggono ddt_fornitore della propria azienda" on ddt_fornitore for select using (is_member(company_id));
create policy "membri non-viewer creano ddt_fornitore" on ddt_fornitore for insert with check (is_member(company_id) and not is_viewer_only(company_id));
create policy "membri non-viewer aggiornano ddt_fornitore" on ddt_fornitore for update using (is_member(company_id) and not is_viewer_only(company_id));
create policy "admin cancella ddt_fornitore" on ddt_fornitore for delete using (is_admin(company_id));

-- Nuovo tipo di documento numerato: next_document_number()/bumpCounterPast
-- lato client non hanno bisogno di modifiche (il prefisso lo passa chi
-- chiama), ma il vincolo su document_counters.doc_type è un elenco chiuso.
alter table document_counters drop constraint document_counters_doc_type_check;
alter table document_counters add constraint document_counters_doc_type_check
  check (doc_type in ('OC','OF','DDT','FT','FTF','NC','NCF','PREV','DDTF'));
