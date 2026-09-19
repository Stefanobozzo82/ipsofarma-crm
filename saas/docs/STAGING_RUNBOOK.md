# Staging isolato: esecuzione e verifiche

Stato registrato il 19 settembre 2026. Ambiente dedicato ai dati sintetici del branch di stabilizzazione; nessuna dichiarazione di prontezza alla produzione.

| Voce | Evidenza acquisita |
| --- | --- |
| Progetto Supabase | `ffjzhtzavkuwysmabmds`, separato dalla produzione |
| Piano e regione | Free, Irlanda |
| PostgreSQL | 17.6 |
| Schema | 30 migrazioni applicate, dopo verifica iniziale di ambiente vuoto |
| Edge Function distribuite | `ai-proxy`, `send-email`, `stripe-checkout`, `stripe-webhook` |
| Secret provider | Non configurati |
| CORS | Soltanto origini locali sulla porta 8080 |
| Test locali | 321 superati, Node 24 / PGlite PostgreSQL 18.3 |
| SQL remoto | Smoke con rollback e gare DDT/IA/inviti superati |
| HTTP remoto | Auth/PostgREST ed Edge: 25 asserzioni superate, cleanup completato |

## Anteprima del frontend

Da `saas/`, con Node 24:

```sh
node scripts/staging-preview.cjs
```

Aprire [http://127.0.0.1:8080](http://127.0.0.1:8080), verificando il banner **STAGING — solo dati di prova**. Fermare il processo con Ctrl+C.

Il server legge `staging.config.json`, accetta esclusivamente una chiave pubblicabile, ascolta soltanto sull'interfaccia locale e verifica che il progetto sia diverso dalla produzione. Sostituisce URL e chiave nella risposta HTML e blocca riferimenti residui a backend diversi: **non riscrive gli HTML di produzione**. La configurazione contiene soltanto dati pubblici; non inserirvi service key o credenziali provider.

Prima del collaudo controllare nel pannello rete del browser il backend `ffjzhtzavkuwysmabmds.supabase.co`. Usare account sintetici e ricaricare le pagine già aperte quando cambia il contratto delle RPC. La configurazione Capacitor/mobile non viene modificata automaticamente.

Il server è stato verificato via HTTP. Due tentativi di collegamento al browser dell'app sono terminati con timeout dello strumento di interfaccia: **non è stato completato un test E2E browser**. Questo limite non annulla le prove HTTP Auth/PostgREST dirette, che sono distinte.

## Configurazione server, senza valori riservati

Impostare i secret soltanto sul progetto staging, senza riportarli in repository, comandi versionati o output di test. Le variabili Supabase server sono `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`; quest'ultima non deve mai essere servita al browser.

- `EDGE_ALLOWED_ORIGINS`: origini esatte `http://127.0.0.1:8080` e `http://localhost:8080`. Una porta diversa richiede un aggiornamento esplicito della allowlist. CORS non sostituisce autenticazione e membership.
- `GEMINI_API_KEY`: chiave provider IA separata. `AI_PROVIDER_TIMEOUT_MS`: default **60000 ms**, limitato dal codice a **1000–120000 ms**. Payload massimo 20 MiB e risposta upstream massima 2 MiB. I test SQL delle quote non richiedono chiamate al provider.
- `RESEND_API_KEY`, `RESEND_FROM`, eventuale `PLATFORM_NAME`: usare mittente verificato e destinatari di prova autorizzati. Un indirizzo aziendale letto dal database non ne certifica la proprietà.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: esclusivamente modalità test. Configurare anche prezzi di test e URL ammessi prima del collaudo dei pagamenti.

Al momento del registro i secret provider non sono configurati: errori «servizio non configurato» sono attesi. Non introdurre fallback alle chiavi di produzione. `solleciti-automatici` non fa parte delle quattro funzioni distribuite in questa fase; scheduler e invii reali non sono stati attivati implicitamente.

Lo smoke Edge ha verificato gli esiti coerenti con questa configurazione: IA 503, email 500, checkout 400 per prezzo non configurato, webhook 503 per secret assente. Non sono prove di successo dei provider. La migrazione 0030 è stata applicata; il lint remoto non riporta errori o avvisi. Smoke SQL e HTTP ripetuti dopo questo aggiornamento: superati.

## Ripetere le prove

1. Da `saas/`, eseguire `npm ci --ignore-scripts` e `npm test`. L'installazione richiede rete; la suite successiva usa fixture locali. Conservare commit, versioni e output effettivo.
2. Verificare il target staging nel runner prima di ogni comando remoto. Controllare migrazioni e privilegi distribuiti; non applicare script alla produzione né ripetere alla cieca migrazioni già applicate.
3. Seguire [`../tests/staging/README.md`](../tests/staging/README.md). Lo smoke SQL termina con rollback; un errore richiede rollback o chiusura della connessione. Non ricreare lo schema Auth del servizio usando le fixture PGlite.
4. Per le gare usare connessioni indipendenti sovrapposte. Registrare attesa ed esiti, poi eseguire verifica e cleanup dei soli ID sintetici dedicati, anche dopo fallimenti. Una sequenza su una sola connessione non dimostra concorrenza.
5. Collaudare separatamente browser/mobile e provider di test. Le tre gare già provate non coprono annullamento contro fatturazione, tutte le sequenze quota/documenti o la disponibilità sotto carico.

Smoke SQL, gare sull'ultimo residuo DDT/quota IA/posto invito e smoke HTTP Auth/PostgREST hanno avuto esito positivo; le fixture sintetiche sono state pulite. L'assenza di Docker locale ha prodotto un avviso relativo alla cache, senza bloccare migrazioni, deploy o prove remote. Non equivale ad aver verificato lo stack Supabase locale.

## Recupero e limiti

Le RPC devono annullare insieme documento, quantità, numero e registro in caso di errore. Per una risposta persa usare lo stesso request ID con lo stesso payload. Le chiavi automatiche della pagina non costituiscono una coda durevole dopo ricaricamento; controllare lo stato persistito prima di ricreare un documento.

Per IA un esito ignoto rimane conteggiato e il replay HTTP 409 non ripete la richiesta esterna. Una nuova chiave identifica un nuovo tentativo potenzialmente a pagamento. Per Stripe restano da trattare eventi nello stesso secondo, riconciliazione remota e checkout distinti con chiavi diverse.

Restano incompleti o non collaudati: note di credito/storni ed eventi pagamento; creazione fatture fornitore e percorsi autonomi con più scritture; riconciliazione dello storico ambiguo; browser/mobile completi; provider reali; osservabilità completa e restore. Gli abort da deadlock conservano l'atomicità ma richiedono gestione dei retry e ulteriori prove di contesa.

Il piano Free non dimostra disponibilità di backup automatici o PITR. Prima del rilascio definire backup e ripristino compatibili con il piano, includendo dati, schema, storage e configurazione, e provarli su ambiente separato: **restore non ancora eseguito**. Non adottare downgrade SQL distruttivi come rollback automatico.
