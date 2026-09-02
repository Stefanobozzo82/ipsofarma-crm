-- ============================================================================
-- 0012 — Numero documento modificabile a mano
--
-- Richiesto dall'azienda: poter correggere/scegliere il numero di un
-- ordine cliente invece di accettare sempre e solo quello proposto — come
-- nel vecchio gestionale, dove "Numero ordine" era un campo scrivibile,
-- non solo mostrato.
--
-- next_document_number() (0004) resta l'unica strada per CONSUMARE un
-- numero automatico. Qui serve solo un modo per SPOSTARE IN AVANTI il
-- contatore quando l'utente ne scrive uno a mano più alto del prossimo
-- libero, così i numeri automatici futuri non si ripetano né tornino
-- indietro rispetto a quello scritto a mano — stessa logica di
-- consumeNum() nel gestionale originale (mai indietro, solo in avanti).
-- Nessuna nuova tabella: document_counters esiste già (0004) ed è già
-- leggibile dal client via RLS — qui manca solo una scrittura controllata.
-- ============================================================================

create or replace function bump_document_counter(p_company_id uuid, p_doc_type text, p_anno int, p_almeno int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_member(p_company_id) then
    raise exception 'utente non autorizzato per questa azienda';
  end if;
  if is_viewer_only(p_company_id) then
    raise exception 'un utente in sola lettura non puo'' generare documenti';
  end if;

  insert into document_counters (company_id, doc_type, anno, next_value)
  values (p_company_id, p_doc_type, p_anno, p_almeno)
  on conflict (company_id, doc_type, anno)
  do update set next_value = greatest(document_counters.next_value, p_almeno);
end;
$$;

comment on function bump_document_counter(uuid, text, int, int) is
  'Sposta in avanti (mai indietro) il contatore di un tipo di documento, cosi'' i numeri automatici futuri non si ripetono dopo che qualcuno ne ha scritto uno a mano piu'' alto del prossimo libero.';
