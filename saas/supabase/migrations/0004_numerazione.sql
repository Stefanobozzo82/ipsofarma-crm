-- ============================================================================
-- 0004 — Numerazione documenti, atomica per costruzione
--
-- Nel gestionale attuale, i contatori (DB.counters: OC, OF, DDT, FT, ...)
-- vivono in backup.json e si "fondono" a fatica tra dispositivi diversi —
-- e' la causa diretta dei numeri d'ordine duplicati o disallineati che
-- abbiamo corretto a mano piu' volte in questa sessione.
--
-- Qui il "prossimo numero libero" non si fonde: si assegna in un'unica
-- operazione atomica. Postgres blocca la riga del contatore durante
-- l'UPDATE, quindi anche cento richieste simultanee per lo stesso tipo di
-- documento non possono mai ricevere lo stesso numero.
-- ============================================================================

create table document_counters (
  company_id uuid not null references companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('OC','OF','DDT','FT','FTF','NC','NCF','PREV')),
  anno integer not null,
  next_value integer not null default 1,
  primary key (company_id, doc_type, anno)
);

comment on table document_counters is 'Un contatore per azienda, tipo documento e anno. Non va mai scritto direttamente dal client: solo tramite next_document_number().';

alter table document_counters enable row level security;

create policy "membri leggono i contatori della propria azienda" on document_counters
  for select using (is_member(company_id));

-- nessuna policy di insert/update/delete per il client: l'unica scrittura
-- passa dalla funzione qui sotto, eseguita con i privilegi del suo
-- proprietario (security definer) cosi' da poter aggiornare il contatore
-- anche se il chiamante ha solo il permesso di lettura sulla tabella.

create or replace function next_document_number(p_company_id uuid, p_doc_type text, p_anno int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if not is_member(p_company_id) then
    raise exception 'utente non autorizzato per questa azienda';
  end if;
  if is_viewer_only(p_company_id) then
    raise exception 'un utente in sola lettura non puo'' generare documenti';
  end if;

  insert into document_counters (company_id, doc_type, anno, next_value)
  values (p_company_id, p_doc_type, p_anno, 2)
  on conflict (company_id, doc_type, anno)
  do update set next_value = document_counters.next_value + 1
  returning next_value - 1 into v_next;

  return p_doc_type || '/' || p_anno || '/' || lpad(v_next::text, 4, '0');
end;
$$;

comment on function next_document_number(uuid, text, int) is
  'Restituisce il prossimo numero libero per un tipo di documento, es. FT/2026/0079, e incrementa il contatore in modo atomico. Chiamata dal client via RPC: mai piu'' un numero duplicato, indipendentemente da quanti dispositivi scrivono insieme.';
