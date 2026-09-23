# Test di stabilizzazione

**Stato corrente, 19 settembre 2026: 321 test locali superati**, zero fallimenti, Node 24 / PGlite PostgreSQL 18.3. I conteggi dei primi incrementi riportati sotto sono storici. La suite corrente comprende le migrazioni fino a `0030`, con versioni di partenza diverse secondo il comportamento isolato dal test.

Requisito: Node.js 24 o superiore. Installare le dipendenze di sviluppo bloccate nel lockfile; l'esecuzione successiva non richiede credenziali o rete.

Da `saas/`:

```sh
npm ci --ignore-scripts
npm test
```

I test end-to-end nel browser vero (Playwright, con una propria azienda usa-e-getta per ogni test) sono a parte, in [`e2e/`](e2e/README.md): il runner qui sopra (`tests/*.test.cjs`) non li raccoglie.

I test browser/Edge eseguono il codice effettivo con store, Supabase e provider simulati:

- `coverage.test.cjs`: copertura quantitativa ordini fornitore, residui, righe duplicate, più ordini e link legacy. Sulla baseline `7cc2b0e` 7 degli 11 test falliscono; con la correzione passano tutti.
- `cors.test.cjs`: allowlist esatta, origini opache/malevole, configurazione mancante, richieste senza Origin e isolamento degli header.
- `edge-cors.test.cjs`: handler IA e checkout, preflight, origini vietate e autenticazione ancora obbligatoria.
- `email*.test.cjs`: identità aziendale server-side, ruoli e contratto del client; vedere i nomi dei casi nel runner.
- `movements-query.test.cjs`: query magazzino con relazione PostgREST esplicitamente selezionata e propagazione errori.
- `customer-ddt-client.test.cjs`: wrapper RPC e generazione dal residuo, chiave stabile nei retry, indici originali e split per lotto.
- `ddt-form.test.cjs`: logica effettiva del modulo manuale eseguita con adattatore DOM minimo, numero automatico/manuale, errori e doppio clic durante il controllo quota. Non è un test browser E2E.

I test SQL eseguono invece le migration originali sul motore PostgreSQL di [PGlite](https://pglite.dev/docs/about), in memoria:

- `company-permissions.test.cjs`: riproduzione dell'aggiornamento non autorizzato del piano nella baseline; revoca privilegi, campi permessi, ruoli, scritture Stripe, registrazione e rollback.
- `tenant-foreign-keys.test.cjs`: 22 relazioni, INSERT e UPDATE cross-tenant, lettura/scrittura RLS con due aziende su 14 tabelle, righe storiche incoerenti, validazione e comportamenti di cancellazione.
- `atomic-ddt.test.cjs`: creazione DDT collegato, autorizzazione, snapshot obsoleto, retry, righe duplicate, rollback con errori iniettati e numerazione oltre 9999.

`helpers/database.cjs` crea ruoli e una fixture minima di `auth.users`/`auth.uid()`, poi applica il SQL versionato senza riscriverlo. I GRANT iniziali simulano deliberatamente un'installazione permissiva. Questo verifica il motore SQL, non il servizio Supabase Auth o i GRANT della produzione. Ambiente verificato: Node 24.19.0, PGlite 0.5.8, PostgreSQL 18.3. Le migration usano sintassi PostgreSQL 15+, da ricollaudare sulla versione dello staging. PGlite non dimostra concorrenza tra sessioni indipendenti.

Il runner usa il supporto TypeScript di Node e, per caricare gli handler Deno con dipendenze simulate, `stripTypeScriptTypes`, che può emettere un avviso sperimentale. Non sostituisce `deno check`, il bundling Supabase o un collaudo su staging.

Validazione locale: 144 test superati. La copertura transazionale documentale riguarda soltanto la creazione di DDT cliente collegato a ordine. Questa suite non attesta concorrenza multi-sessione, API PostgREST reale, consegna email, pagamenti o flussi E2E. I criteri per estenderla sono in `../docs/STABILIZATION_AUDIT.md`. Non sono stati aggiunti workflow alla radice del repository: il perimetro autorizzato è `saas/`.

## Suite aggiunte e prove attuali

Il paragrafo precedente fotografa il terzo incremento; il quarto amplia la copertura:

- SQL: `customer-order-concurrency`, `customer-ddt-lifecycle`, `atomic-invoice`, `supplier-receipt`, `ai-quota`, `stripe-events`, `membership-capacity`, `stock-history`, `document-quota`, `api-permissions`.
- Client e form: `customer-order-form`, `invoice-form`, `invoice-cascade`, `ai-invoice-plan`, `supplier-receipt-client`, `store-hardening`, `staging-preview`.
- Handler con provider simulati: `ai-proxy`, `stripe-checkout`, `stripe-webhook`, oltre alle suite email e CORS già presenti.

I nomi sono i prefissi dei file `*.test.cjs`; leggere i singoli casi per le invarianti. Comprendono rettifica/annullamento tracciati, snapshot obsoleti, identità righe, fallimenti iniettati, quote, ultimo amministratore e paginazione completa anche quando il limite del server è inferiore a 1000. I test form eseguono funzioni reali con DOM simulato e non equivalgono a E2E browser.

**Prove remote separate dal totale 321:** staging `ffjzhtzavkuwysmabmds`, PostgreSQL 17.6, 30 migrazioni applicate; smoke SQL con rollback superato; tre gare reali su connessioni CLI indipendenti (ultimo residuo DDT, ultima quota IA, ultimo posto invito) superate; smoke HTTP Auth/PostgREST ed Edge con **25 asserzioni superate**. Verifiche delle invarianti e cleanup sintetico completati con successo. Gli script SQL ripetibili sono in [`staging/README.md`](staging/README.md). La migrazione 0030 è inclusa: lint remoto senza errori o avvisi e quattro test locali aggiuntivi.

Queste prove non certificano tutte le combinazioni di lock né provider reali, flussi browser/mobile completi o restore. Due tentativi di collegare l'anteprima al browser dell'app sono terminati in timeout dello strumento; il server di anteprima risponde via HTTP, ma non è stato completato un E2E browser. Vedere [`../docs/STAGING_RUNBOOK.md`](../docs/STAGING_RUNBOOK.md). Le quattro Edge Function distribuite non hanno ancora credenziali provider configurate.

## Evidenze aggiornate — fase 5, 19 settembre 2026

Questo paragrafo sostituisce i precedenti conteggi e i limiti browser degli incrementi storici. Suite locale completa: **413 test superati**, zero fallimenti (`outputs/validation-phase5.txt` nel workspace). In staging sono applicate le migrazioni **0031–0033**, per un totale di **33**; smoke HTTP Auth/PostgREST ed Edge: **44 asserzioni superate** (`outputs/staging-http-phase5.txt`). Successivamente applicata anche **0034**, per un totale corrente di **34 migrazioni**: lint remoto senza errori o avvisi, smoke HTTP ripetuto con 44 asserzioni superate e dry-run aggiornato senza migrazioni pendenti. I 413 test completi sono riferiti allo schema 33; ulteriori 32 test mirati sono superati sullo schema 34 e non vengono sommati al totale, perché ripetono copertura esistente.

Percorso nel browser reale: accesso con account sintetico, selezione azienda, ordine di 10 pezzi, DDT parziale di 3 pezzi al prezzo di 10 euro con IVA 0%, fattura da 30 euro, incasso parziale di 10 euro e saldo del residuo di 20 euro, fino al 100%. Il difetto che sostituiva IVA 0 con l'aliquota predefinita è stato osservato prima della correzione e verificato corretto dopo.

Nel viewport mobile di 390 pixel, le schermate pagamenti e collegamenti documentali risultano leggibili; misura DOM `documentWidth = clientWidth = 375`, senza overflow orizzontale del documento. È una verifica di viewport nel browser, non un collaudo completo su dispositivo mobile o di tutti i percorsi E2E. Le fixture browser sono state rimosse con SQL limitato agli identificativi di prova e la pulizia è stata verificata.

Restano da collaudare provider reali, restore e tutte le gare concorrenti. Restano da completare outbox durevole, riconciliazione dello storico ambiguo e allocazioni delle note credito legacy multiple, ciclo completo storni/rimborsi e integrazioni fiscali. Il saldo manuale non prova un incasso bancario. Queste evidenze non dichiarano il prodotto commercialmente completo o pronto alla produzione.

## Stato corrente — chiusura core contabile, schema 37

Applicate in staging anche le migrazioni **0035–0037**, per **37 migrazioni totali**, con lint remoto senza errori o avvisi. Il ciclo atomico NC/NCF e il completamento manuale ordini con audit sono implementati: non sono più lacune aperte. Il completamento manuale è amministrativo, richiede motivo e snapshot, non prova consegna fisica e non genera movimenti magazzino. La 0037 impedisce rinumerazioni che spezzerebbero riferimenti legacy nelle note di credito.

Validazione finale sullo schema 37: **453/453 test della suite completa superati** in circa 94 secondi; **71/71 asserzioni HTTP superate**, pulizia fixture verificata e lint remoto senza errori o avvisi. I risultati precedenti rimangono evidenze storiche nei paragrafi sopra.

Restano aperti: account/credenziali e collaudo provider (risposta utente ancora mancante), backup e restore provato, stress delle gare concorrenti, copertura mobile/dispositivi estesa, riconciliazione dello storico ambiguo, outbox email durevole e casi Stripe con eventi nello stesso secondo o checkout distinti per lo stesso piano/piani diversi. Non viene dichiarata prontezza commerciale o produzione.
