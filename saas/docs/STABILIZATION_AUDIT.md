# Audit di stabilizzazione SaaS

Data: 19 settembre 2026. Baseline esaminata: `7cc2b0ef0e6c2c8862b44b57758d82b65635dca0`.

## Perimetro e livello di evidenza

Questo documento descrive la baseline prima delle correzioni del branch di stabilizzazione. Le eventuali modifiche successive devono essere valutate tramite diff e test: la presenza di una voce qui non dimostra che il problema persista nella versione corrente.

Perimetro applicativo: esclusivamente `saas/`. Nessuna migrazione applicata a un servizio remoto, nessun invio email reale, nessuna chiamata IA a pagamento, nessuna modifica a dati di produzione, nessun merge o deploy eseguito per questo audit. La lettura del codice non certifica che lo schema effettivamente distribuito corrisponda alle migrazioni versionate.

Livelli di evidenza:

- **Statico**: percorso osservato nel codice o nelle migrazioni. Richiede conferma su ambiente isolato quando dipende da privilegi o concorrenza PostgreSQL.
- **Riprodotto localmente**: esecuzione del `cascade.js` originale in Node VM con store simulato, senza rete. Sono riproduzioni del difetto, non prove che sia corretto.
- **Da collaudare**: comportamento operativo che richiede staging, credenziali dedicate o verifica del database reale.

Il checkout iniziale non contiene una suite permanente di regressione SaaS né una pipeline di verifica SaaS individuata nell'albero esaminato. I test Android di esempio non coprono le regole gestionali. Commenti che dichiarano precedenti collaudi non equivalgono a test ripetibili eseguiti in questa attività.

## Esito e priorità

Il codice offre basi utili: RLS per azienda, autenticazione sulle Edge Function, contatore SQL con incremento atomico, chiavi provider lato server, firma HMAC del webhook e vista giacenze `security_invoker`. Restano lacune sostanziali nei vincoli di autorizzazione, nelle transazioni e nella ricostruibilità dei dati. Non è giustificato dichiarare il sistema pronto alla produzione sulla sola base di questo audit.

| ID | Priorità | Evidenza | Problema e conseguenza | Riferimenti nella baseline |
| --- | --- | --- | --- | --- |
| SEC-01 | P0 | Statico | La policy UPDATE delle aziende autorizza l'admin sulla riga, senza proteggere le colonne `piano`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`. I commenti «solo webhook» non costituiscono un vincolo. `saveCompany` accetta un patch generico. Con i normali privilegi UPDATE del client, un admin può modificare lo stato commerciale della propria azienda. Verificare e fissare anche i GRANT effettivi. | `supabase/migrations/0001_aziende_e_utenti.sql`, `0007_abbonamenti.sql`; `web/app/store.js: saveCompany` |
| SEC-02 | P1 | Statico | Le FK di documenti, anagrafiche e movimenti collegano principalmente il solo UUID. La policy sul `company_id` del figlio non dimostra che il padre appartenga alla stessa azienda. Occorrono FK composite `(company_id, id)`; non è stata provata lettura di righe altrui. | Migrazioni `0002`, `0003`, `0009`, `0016` |
| SEC-03 | P1 | Statico | `send-email` accetta identità mittente/reply-to dal client e verifica l'appartenenza a una qualsiasi azienda, senza contesto azienda esplicito. Mancano limiti e registro invii. | `supabase/functions/send-email/index.ts`; `web/app/store.js` |
| QUOTA-01 | P1 | Statico | IA: conteggio quota, chiamata provider e inserimento utilizzo sono separati. Chiamate concorrenti possono superare il limite; gli errori restituiti da insert non sono controllati; il mancato caricamento del piano può saltare il controllo. | `supabase/functions/ai-proxy/index.ts`; migrazione `0011` |
| QUOTA-02 | P1 | Statico | Limiti documenti applicati dal frontend e volutamente permissivi in errore, aggirabili con scritture API dirette. Il conteggio iniziale omette `ddt_fornitore`. | `web/app/store.js: DOC_TABLES, checkDocLimit` |
| INV-01 | P1 | Statico | Creazione inviti basata su count senza serializzazione; accettazione senza lock della riga o nuova verifica della capienza. La policy admin `FOR ALL` su memberships consente inoltre il percorso diretto, fuori dalla RPC inviti. Un vecchio invito può aggiornare il ruolo di una membership esistente tramite upsert. | Migrazioni `0001`, `0008`, `0013` |
| PAY-01 | P1 | Statico | Webhook Stripe ignora gli errori delle scritture e risponde 200; non registra `event.id`; l'ordine degli eventi può far aggiornare zero aziende prima del collegamento della subscription. Possibili stato perso e mancato retry. | `supabase/functions/stripe-webhook/index.ts` |
| PAY-02 | P1 | Statico | Checkout: persistenza customer senza controllo dell'errore; nessuna idempotency key visibile per la creazione; URL di ritorno forniti dal client. Necessari controllo delle origini e riconciliazione. | `supabase/functions/stripe-checkout/index.ts` |
| DOC-01 | P1 | Riprodotto localmente | DDT salvato prima dell'aggiornamento ordine: errore simulato al secondo salvataggio lascia il solo DDT persistito. Anche altri flussi sono sequenze di chiamate indipendenti. | `web/app/cascade.js: creaDDTDaResiduo, creaFattureDaOrdine` |
| DOC-02 | P1 | Riprodotto localmente | Due righe con stesso codice ricevono entrambe il totale consegnato/ricevuto: una quantità 6 diventa 12 nell'ordine. Il retry dello stesso DDT incrementa nuovamente `qtyEv` da 3 a 6. | `web/app/cascade.js: applicaConsegna, applicaRicezione` |
| DOC-03 | P1 | Riprodotto localmente | La copertura fornitore considera la presenza del codice, non la quantità: 0/100 e 20/100 risultano coperti. I controlli 100/100 e 120/100 risultano correttamente coperti. | `web/app/cascade.js: righeNonOrdinate, statoOrdineFornitore` |
| STOCK-01 | P1 | Riprodotto localmente | Con lotto noto di 4 pezzi e richiesta 10, l'allocazione attribuisce tutti e 10 allo stesso lotto. Occorre distinguere disponibilità verificata da quantità non assegnata. | `web/app/cascade.js: splitRigaByLotti` |
| STOCK-02 | P1 | Statico | Lo storico movimenti non ha policy UPDATE/DELETE, ma `prodotto_id ON DELETE CASCADE` lo elimina cancellando il prodotto. `created_by` non è vincolato al chiamante. L'immutabilità dichiarata non è completa. | `supabase/migrations/0009_magazzino.sql` |
| DOC-04 | P1 | Statico | Eliminazione fisica dei documenti e FK con `ON DELETE SET NULL` indeboliscono la storia. Upsert di snapshot completi senza versione attesa espone a sovrascritture concorrenti. | Migrazione `0003`; `web/app/store.js: saveDoc, removeDoc`; `web/app/cascade.js` |
| NUM-01 | P2 | Statico / da collaudare | L'incremento SQL è atomico, ma viene consumato separatamente dal salvataggio del documento. Verificare formato oltre 9999: l'espressione `lpad(v_next::text, 4, '0')` richiede test di confine. Non è dimostrata alcuna duplicazione sotto carico su un database reale. | `supabase/migrations/0004_numerazione.sql`, `0012_numero_manuale.sql` |
| OPS-01 | P2 | Statico | Solleciti: invio e marcatura avvenuto invio separati, con errori DB non gestiti; retry potenzialmente duplicato. Alcune query non sono paginate. | `supabase/functions/solleciti-automatici/index.ts` |
| API-01 | P2 | Statico | CORS wildcard sulle funzioni browser; limiti dimensione payload, schema, timeout e token IA da rafforzare. CORS non sostituisce autenticazione o autorizzazione e non blocca chiamanti non browser. | Edge Function browser |
| DATA-01 | P2 | Statico | `loadCollection` usa paginazione offset senza ordinamento stabile; dataset mutanti possono produrre salti o duplicati. Altre letture estese sono prive di paginazione. | `web/app/store.js` |

## Vincoli di compatibilità

Le associazioni storiche non hanno tutte lo stesso formato: alcuni campi conservano numeri documento, altri UUID; le righe possono non avere un identificatore persistente. Non introdurre una conversione distruttiva né ricalcolare indiscriminatamente `qtyEv` dal solo sottoinsieme di documenti collegabili.

L'aggiunta di `line_id` deve preservare i record esistenti e distinguere collegamenti certi, fallback legacy non ambiguo e casi ambigui da segnalare. Le correzioni delle quantità devono essere testate su righe duplicate, consegne parziali, più documenti, retry e annullamenti. I completamenti manuali devono diventare eventi motivati e tracciati, senza inventare consegne storiche.

Il magazzino nella migrazione `0009` è deliberatamente manuale: l'automazione dei movimenti richiede una decisione di prodotto e regole per deposito, rettifiche, annullamenti e idempotenza. Non aggiungere scarichi automatici in modo implicito.

## Piano progressivo e criteri di accettazione

### Fase 1 — Correzioni isolate e regressioni permanenti

1. Congelare fixture anonimizzate per i difetti documentali riprodotti e aggiungere un comando test locale senza servizi remoti.
2. Correggere copertura quantitativa e identità email verificata dall'azienda selezionata; coprire quantità 0, parziali, eccedenti, righe duplicate, annullati, tenant diverso, viewer e payload maleformati.
3. Documentare ogni correzione con test che fallisce sulla baseline e passa sul branch. Distinguere mock dal collaudo della Edge Function distribuita.

### Fase 2 — Vincoli e autorizzazioni PostgreSQL

1. Proteggere esplicitamente le colonne gestite dal server, mantenendo editabili le sole impostazioni aziendali previste.
2. Aggiungere FK composite con preflight di incoerenze e strategia `NOT VALID`/validazione controllata dove appropriata; nessuna cancellazione automatica di record non conformi.
3. Centralizzare membership/inviti in operazioni autorizzate, serializzando la capienza e impedendo bypass diretti. Conservare un amministratore e gestire inviti ripetuti/scaduti senza cambi ruolo impliciti.
4. Rendere immutabile lo storico anche rispetto alle cancellazioni dei genitori, con rettifiche e attribuzione dell'autore lato server.

Criterio: test SQL con due tenant e ruoli anonimo, viewer, operatore, admin; aggiornamenti di colonne riservate negati; collegamenti incrociati negati; capienza rispettata sotto richieste concorrenti. Eseguire su database locale o staging dedicato, mai produzione.

### Fase 3 — Transazioni documentali

Introdurre RPC transazionali per numero, documento, collegamenti ed eventi quantità, con chiave idempotenza e controllo versione. Aggiungere identificatori riga, annullamenti tracciati e derivazione delle quantità solo per dati con lineage affidabile. Prevedere migrazione graduale e consultazione dello storico legacy.

Criterio: failure injection in ogni passaggio, nessuna persistenza parziale; retry senza nuovi effetti; concorrenza senza quantità duplicate o aggiornamenti persi; numerazione oltre 9999 e numeri manuali verificati.

### Fase 4 — Quote, pagamenti e messaggi

Prenotare quota IA in una transazione atomica, con request ID, stato e politica esplicita per errori del provider; imporre limiti payload/token e registrare gli errori di contabilizzazione. Applicare anche i limiti documentali e utenti lato server.

Per Stripe, registrare gli eventi con unicità, controllare ogni errore e il numero di righe modificate, gestire replay/ordine invertito e riconciliare subscription/customer. Collaudare esclusivamente in modalità test. Per email/solleciti, definire outbox, retry e limite invii; distinguere «inviato dal provider» da «consegnato».

### Fase 5 — Staging, ripristino e rilascio

- Configurare Supabase e URL frontend separati, chiavi provider dedicate e Stripe test; controllare che la build mobile di collaudo punti allo staging.
- Usare dati sintetici; verificare flussi browser e mobile, offline/riconnessione, import, stampa e autorizzazioni.
- Registrare versione schema e artefatti del rilascio; effettuare backup secondo le capacità del piano effettivo, senza presumere PITR disponibile.
- Provare il restore in un database isolato e misurare tempi e perdita dati ammessa; includere allegati/storage e configurazioni nel piano.
- Preparare rollback applicativo compatibile con migrazioni additive; evitare downgrade distruttivi automatici. Definire riconciliazione e recupero per operazioni già eseguite.
- Abilitare osservabilità con request ID e metriche errori, latenze, quota e mismatch; non registrare segreti, allegati o contenuti sensibili.

Merge, applicazione migrazioni e deploy rimangono azioni separate dal lavoro di implementazione e richiedono il rispetto delle autorizzazioni del progetto. Nessuna affermazione di prontezza può sostituire i collaudi mancanti.

## Primo incremento sul branch

La correzione quantitativa della copertura fornitore è stata sottoposta a review indipendente insieme ai relativi test permanenti. Conserva i collegamenti legacy per numero documento e assegna ciascuna quantità una sola volta tra le righe dello stesso codice. Non risolve la transazionalità o l'identificazione univoca delle righe di consegna, né introduce un modello di annullamento.

Il modulo CORS condiviso e l'integrazione in `ai-proxy` e `stripe-checkout` usano origini esatte, header per richiesta e comportamento chiuso per origini non configurate. **`EDGE_ALLOWED_ORIGINS` deve essere configurata nei secret delle Edge Function prima di distribuirle**; altrimenti le chiamate browser vengono rifiutate. Le richieste senza `Origin` proseguono ai controlli di autenticazione: CORS non è un confine di sicurezza per client non browser. La review di codice non equivale a un deploy o a un collaudo di rete.

Per l'identità email, leggere nome e indirizzo dalle impostazioni aziendali elimina l'override nel payload, ma l'indirizzo aziendale resta configurabile dall'amministratore: **dato recuperato dal database non significa proprietà del dominio verificata**. Un'eventuale verifica del dominio/reply-to richiede un flusso separato.

Il nuovo contratto email richiede `company_id` e permette l'invio solo ai ruoli `admin` e `operatore` dell'azienda richiesta. I vecchi client senza azienda esplicita vengono respinti; il futuro rilascio deve coordinare frontend e backend e prevedere il ricaricamento delle pagine già aperte. Non mantenere il fallback verso una membership arbitraria per aggirare questa incompatibilità intenzionale.

Verifica indipendente del primo incremento: `node --test tests/*.test.cjs` dalla cartella `saas`, 32 test superati, zero fallimenti. Comprendono 11 casi di copertura, 8 casi CORS/helper-handler e 13 casi email/autorizzazione/wrapper, con database e provider simulati. Il reviewer ha controllato anche i due chiamanti browser di `sendEmail`, entrambi aggiornati al contesto azienda esplicito. Il risultato non valida RLS o API esterne reali e non riguarda le altre criticità della tabella.

## Verifiche ancora mancanti

Non eseguiti in questo audit: test RLS contro Postgres reale; test SQL di concorrenza; controllo dei GRANT/schema effettivamente distribuiti; test Stripe test-mode; invii email di prova; integrazione provider IA; E2E browser/mobile; audit dipendenze completo; restore di backup; verifica monitoraggio e configurazione domini. Queste attività sono criteri di avanzamento, non risultati già acquisiti.


