# Ordini fornitore e lettura note di credito — incremento 0033

La migrazione `0033_supplier_order_concurrency.sql` introduce `update_supplier_order(company_id, order_id, expected, document)`. Il confronto sotto lock comprende numero, data, fornitore, righe, `ftf_ids` e `extra`. Un editor obsoleto riceve un errore prima della scrittura. La rinumerazione e il contatore OF sono nella stessa transazione.

Le righe esistenti passano `source_order_index`, temporaneo e rimosso prima della persistenza. Il server conserva metadata e quantità ricevute, inclusi zero e codici duplicati. Non permette di eliminare righe ricevute, ridurre quantità sotto il ricevuto o modificare i collegamenti fattura. Dopo una ricezione tracciata conserva posizione e numero delle righe per garantire rettifiche/annullamenti; resta possibile modificare descrizione, prezzo e quantità compatibile. Lo storico non tracciato mantiene il riordino per indice senza riscritture automatiche dei dati.

L’editor OF e la registrazione dello stato email usano il nuovo wrapper senza fallback CRUD. Se la mail è stata inviata ma il CAS rifiuta lo snapshot, il messaggio distingue esplicitamente invio riuscito e stato non registrato. Non è una outbox e non offre invio email esattamente una volta.

La migrazione 0036 sostituisce la chiusura manuale legacy con complete_order_manually: lock ordine, snapshot righe, motivo obbligatorio, registro privato e idempotenza. Non crea movimenti magazzino né documenti di consegna; il completamento amministrativo viene preservato come baseline nelle rettifiche DDT. La modifica diretta delle quantità evase è protetta.

Scadenziario, riconciliazione, dashboard e contesto assistente riconoscono ora `fatturaId` UUID come riferimento autorevole delle note di credito. Soltanto in sua assenza leggono i riferimenti legacy: `ftId`/`ftIds` cliente e `ftfId` fornitore, contenenti numeri documento. Le note multifattura legacy mantengono l’allocazione cronologica, deduplicando i riferimenti. Non viene eseguito alcun backfill. I documenti marcati annullati sono esclusi dai resolver aggiornati.

Il ciclo NC/NCF è ora protetto dalla 0035: creazione/modifica atomiche con snapshot e limite cumulativo, annullamento soft motivato riservato amministratore, sincronizzazione saldi e blocco scritture dirette. Le UI preservano metadata e IVA zero. La 0037 protegge la rinumerazione delle fatture con riferimenti legacy nelle note, incluse quelle annullate; riconciliare lo storico prima di rinumerare. Vedere CREDIT_NOTE_LIFECYCLE.md.

Verifiche locali: test SQL PostgreSQL/PGlite della migrazione 0033, test comportamentali degli handler reali in VM per righe duplicate, rifiuto stale, IVA zero e metadata NCF; test wrapper canonico e resolver dei saldi. Non equivalgono a prove browser complete o a contesa su connessioni PostgreSQL indipendenti.

La verifica IVA zero è estesa a tutti i default 22 nelle pagine web, cascata ordini, stampa ed export Excel. Anche l'importazione FatturaPA conserva AliquotaIVA=0. I default si applicano a valori assenti (o parsing XML non numerico); non convertono più zero in 22. Cinque test comportamentali verificano prefill DDT/fattura, stampa, Excel, cascata e parser XML; controllo sintattico completato sui 92 script web.
