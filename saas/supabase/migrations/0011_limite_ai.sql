-- ============================================================================
-- 0011 — Limite mensile di uso dell'IA per azienda
--
-- Perché: ogni chiamata all'IA (chat, azioni, lettura di un allegato) passa
-- da un'UNICA chiave Gemini condivisa da tutte le aziende del SaaS (vedi
-- ai-proxy/index.ts, Fase 3) — è chi gestisce il prodotto (non l'azienda
-- cliente) a pagarla. checkDocLimit()/limite_documenti_mese esistono già
-- per i documenti creati, ma nessun limite frenava finora quante domande
-- alla chat, quante letture di PDF/foto (che usano il modello più caro,
-- gemini-2.5-pro — vedi ai-import.js) o quante azioni un'azienda potesse
-- chiedere in un mese: un uso molto intenso da parte di una sola azienda
-- costerebbe uguale a nessun uso, a parità di abbonamento.
--
-- Stesso principio di checkDocLimit()/countDocsThisMonth() in store.js, ma
-- qui serve una tabella nuova: a differenza di un documento (una riga già
-- esistente in una tabella con company_id/created_at), non c'è nessuna riga
-- che rappresenti "una domanda alla chat" finché non la creiamo apposta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ai_usage: una riga per ogni chiamata IA che ha superato i controlli di
-- ai-proxy (autenticazione + limite) ed è stata inoltrata a Gemini — non
-- registra il contenuto della richiesta, solo che è avvenuta (nessun dato
-- aziendale in più da proteggere qui: la riga non serve a altro che contare).
-- ---------------------------------------------------------------------------
create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index ai_usage_company_created_idx on ai_usage (company_id, created_at);

comment on table ai_usage is 'Una riga per ogni chiamata IA inoltrata a Gemini (ai-proxy) — usata solo per contare l''uso mensile per azienda contro plans.limite_ai_mese.';

alter table ai_usage enable row level security;

-- Lettura: i membri della propria azienda (per mostrare "N di M richieste
-- usate questo mese" nel gestionale, se in futuro serve visualizzarlo).
create policy "membri leggono l'uso IA della propria azienda" on ai_usage
  for select using (is_member(company_id));

-- Scrittura: ai-proxy chiama questo insert con il token dell'utente reale
-- (mai la service key — stesso approccio del resto delle Edge Function di
-- questo progetto), quindi basta la stessa condizione "is_member" già usata
-- per ogni insert di questo schema. Nessuna policy di update/delete: un
-- registro d'uso non si corregge né si cancella dal client.
create policy "membri registrano il proprio uso IA" on ai_usage
  for insert with check (is_member(company_id));

-- ---------------------------------------------------------------------------
-- plans.limite_ai_mese: null = illimitato (nessun piano lo è oggi — a
-- differenza dei documenti, qui il limite non è una leva commerciale per
-- spingere all'upgrade ma un freno di sicurezza sul costo, quindi anche i
-- piani a pagamento ne hanno uno, largo ma non infinito). Valori scelti per
-- restare comodi con un uso normale (qualche decina di domande/importazioni
-- al giorno) e comunque modificabili in seguito aggiornando questa tabella,
-- senza bisogno di un'altra migrazione.
-- ---------------------------------------------------------------------------
alter table plans add column limite_ai_mese integer;

update plans set limite_ai_mese = 50 where id = 'trial';
update plans set limite_ai_mese = 300 where id = 'base';
update plans set limite_ai_mese = 1000 where id = 'pro';

comment on column plans.limite_ai_mese is 'Numero massimo di chiamate IA (chat + azioni + letture di allegati) al mese per azienda su questo piano. null = illimitato. Freno sul costo (chiave Gemini condivisa), non una leva di vendita come limite_documenti_mese.';

-- ---------------------------------------------------------------------------
-- count_ai_usage_this_month: stesso schema di sicurezza di next_document_number()/
-- list_members() (0004/0008) — security definer perché ai_usage non è
-- interamente leggibile in altro modo dal client con una singola query
-- semplice, ma verifica comunque is_member() prima di contare, così non
-- diventa un modo per leggere l'uso IA di un'azienda a cui non si appartiene.
-- ---------------------------------------------------------------------------
create or replace function count_ai_usage_this_month(p_company_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_member(p_company_id) then
    raise exception 'non fai parte di questa azienda';
  end if;
  return (
    select count(*)::integer from ai_usage
    where company_id = p_company_id
      and created_at >= date_trunc('month', now())
  );
end;
$$;

grant execute on function count_ai_usage_this_month(uuid) to authenticated;
