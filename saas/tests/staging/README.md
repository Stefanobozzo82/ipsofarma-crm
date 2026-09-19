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
