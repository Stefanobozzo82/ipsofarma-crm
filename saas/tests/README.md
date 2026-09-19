# Test di stabilizzazione

Requisito: Node.js 24 o superiore. Installare le dipendenze di sviluppo bloccate nel lockfile; l'esecuzione successiva non richiede credenziali o rete.

Da `saas/`:

```sh
npm ci --ignore-scripts
npm test
```

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
