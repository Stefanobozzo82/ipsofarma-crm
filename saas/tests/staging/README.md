# Smoke su Supabase staging reale

Target autorizzato: `ffjzhtzavkuwysmabmds`. Verificare il target nel runner prima di ogni comando. Non eseguire sulla produzione; non inserire connessioni o password nel repository. Le query devono essere eseguite con un account database autorizzato a creare fixture auth e a fare `SET ROLE`, senza ricreare schema `auth`, ruoli o funzione `auth.uid()`.

`rollback-smoke.sql` usa gli utenti reali Supabase con email confermata e ruoli JWT sintetici, esercita RLS, creazione/correzione/annullamento DDT, snapshot ordine obsoleto, fatturazione, invito/accettazione e quota IA service-only. Si conclude sempre con `ROLLBACK` in caso di successo; un errore deve terminare la connessione o essere seguito da rollback. Non ci sono email o chiamate provider. Questo verifica il database, non il trasporto HTTP o emissione reale di JWT da GoTrue.

## Due connessioni reali

1. Applicare tutte le migrazioni e avviare `concurrency-setup.sql` una sola volta. Le fixture vengono COMMITtate appositamente; nessun UPSERT sovrascrive dati preesistenti.
2. Aprire due invocazioni indipendenti del runner `supabase db query` (consultare `--help` della versione installata per gli argomenti file/connessione). Avviare `concurrency-a.sql`; durante i suoi quattro secondi di pausa avviare `concurrency-b.sql` sulla stessa istanza. Non concatenare i due file in una connessione.
3. A deve completare; B deve attendere e poi ricevere errore di snapshot obsoleto. Se l'ordine di avvio si inverte, può vincere B: comunque deve esserci un solo successo. Conservare durata ed esiti di entrambi, senza confondere il fallimento atteso con un difetto.
4. Eseguire `concurrency-verify.sql`: esattamente un DDT, una operazione e quantità consegnata 10. La numerazione non deve essere consumata dal perdente.
5. Eseguire `concurrency-cleanup.sql` anche in caso di test fallito, dopo aver raccolto le prove. Sono eliminati esclusivamente azienda/utente con ID e nomi dedicati verificati.

Per collaudare il replay concorrente, ripetere setup dopo cleanup e usare in B lo stesso request ID di A (`...0040`): entrambi devono riuscire, uno con `replayed=true`, e le invarianti restano identiche. Creare questa variante in un file temporaneo di lavoro, conservando gli script versionati originali.

Questo scenario dimostra la serializzazione della consegna, non tutte le combinazioni di lock. Estensioni richieste: ultimo posto invito conteso, ultima quota IA contesa, annullamento contro fatturazione e update ordine contro consegna. Non dichiararle eseguite soltanto perché lo smoke o il test PGlite è verde.

## Ultima quota IA e ultimo posto invito

`capacity-setup.sql` crea due aziende e un utente dedicati. Non modifica `plans`: il CHECK del piano azienda ammette solo trial/base/pro, quindi un piano arbitrario per test non sarebbe compatibile. Il setup legge i limiti trial e riempie le sole fixture fino a lasciare una quota/posizione. Limiti non finiti o troppo grandi fanno fallire il setup anziché alterare configurazioni condivise.

Eseguire prima setup, poi `ai-capacity-a.sql` e durante la pausa di quattro secondi `ai-capacity-b.sql` su connessioni separate. Ripetere con `invite-capacity-a.sql`/`invite-capacity-b.sql`. In queste due coppie A deve acquisire il lock prima di B: B contiene un'asserzione sul rifiuto atteso, quindi **entrambi gli script devono terminare correttamente**; un errore significa risultato inatteso, timeout o ordine d'avvio invertito. Verificare che B sia partito prima del commit di A: un run sequenziale verifica la capienza, non la concorrenza.

Terminare con `capacity-verify.sql` e `capacity-cleanup.sql` anche dopo fallimenti, conservando prima gli esiti. I request ID AI riservati non chiamano il provider. Lo script di setup va ripetuto solo dopo cleanup. Rimangono da collaudare separatamente annullamento/fatturazione e update ordine/consegna concorrenti.

## Evidenze aggiornate — fase 5, 19 settembre 2026

Questo paragrafo sostituisce i precedenti conteggi e i limiti browser degli incrementi storici. Suite locale completa: **413 test superati**, zero fallimenti (`outputs/validation-phase5.txt` nel workspace). In staging sono applicate le migrazioni **0031–0033**, per un totale di **33**; smoke HTTP Auth/PostgREST ed Edge: **44 asserzioni superate** (`outputs/staging-http-phase5.txt`). Successivamente applicata anche **0034**, per un totale corrente di **34 migrazioni**: lint remoto senza errori o avvisi, smoke HTTP ripetuto con 44 asserzioni superate e dry-run aggiornato senza migrazioni pendenti. I 413 test completi sono riferiti allo schema 33; ulteriori 32 test mirati sono superati sullo schema 34 e non vengono sommati al totale, perché ripetono copertura esistente.

Aggiornamento successivo sullo schema **0036**: smoke HTTP reale ripetuto con **71 asserzioni superate**, cleanup confermato (`outputs/staging-http-phase5.txt`). Include ora note credito cliente/fornitore (salvataggio, replay, annullamento, snapshot obsoleto e blocco scritture dirette) e completamento manuale ordini cliente/fornitore (autorizzazioni, replay, CAS e protezione qtyEv). I conteggi precedenti restano evidenze storiche; le 71 asserzioni sostituiscono il precedente totale HTTP di 44. Nessuna chiamata ai provider configurati, nessun test in produzione.

Percorso nel browser reale: accesso con account sintetico, selezione azienda, ordine di 10 pezzi, DDT parziale di 3 pezzi al prezzo di 10 euro con IVA 0%, fattura da 30 euro, incasso parziale di 10 euro e saldo del residuo di 20 euro, fino al 100%. Il difetto che sostituiva IVA 0 con l'aliquota predefinita è stato osservato prima della correzione e verificato corretto dopo.

Nel viewport mobile di 390 pixel, le schermate pagamenti e collegamenti documentali risultano leggibili; misura DOM `documentWidth = clientWidth = 375`, senza overflow orizzontale del documento. È una verifica di viewport nel browser, non un collaudo completo su dispositivo mobile o di tutti i percorsi E2E. Le fixture browser sono state rimosse con SQL limitato agli identificativi di prova e la pulizia è stata verificata.

Restano da collaudare provider reali, restore e tutte le gare concorrenti. Restano da completare outbox durevole, riconciliazione dello storico ambiguo e allocazioni delle note credito legacy multiple, ciclo completo storni/rimborsi e integrazioni fiscali. Il saldo manuale non prova un incasso bancario. Queste evidenze non dichiarano il prodotto commercialmente completo o pronto alla produzione.

## Stato corrente — chiusura core contabile, schema 37

Applicate in staging anche le migrazioni **0035–0037**, per **37 migrazioni totali**, con lint remoto senza errori o avvisi. Il ciclo atomico NC/NCF e il completamento manuale ordini con audit sono implementati: non sono più lacune aperte. Il completamento manuale è amministrativo, richiede motivo e snapshot, non prova consegna fisica e non genera movimenti magazzino. La 0037 impedisce rinumerazioni che spezzerebbero riferimenti legacy nelle note di credito.

Validazione finale sullo schema 37: **453/453 test della suite completa superati** in circa 94 secondi; **71/71 asserzioni HTTP superate**, pulizia fixture verificata e lint remoto senza errori o avvisi. I risultati precedenti rimangono evidenze storiche nei paragrafi sopra.

Restano aperti: account/credenziali e collaudo provider (risposta utente ancora mancante), backup e restore provato, stress delle gare concorrenti, copertura mobile/dispositivi estesa, riconciliazione dello storico ambiguo, outbox email durevole e casi Stripe con eventi nello stesso secondo o checkout distinti per lo stesso piano/piani diversi. Non viene dichiarata prontezza commerciale o produzione.
