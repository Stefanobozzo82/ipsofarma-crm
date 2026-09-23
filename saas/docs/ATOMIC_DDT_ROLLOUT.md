# Creazione atomica di DDT cliente collegato a ordine

## Perimetro del primo incremento

La RPC `create_customer_ddt(company_id, order_id, request_id, expected_rows, document)` introduce una transazione per la **creazione** di un DDT cliente collegato a un ordine: documento, numerazione, aggiornamento dell'ordine e registrazione dell'operazione devono riuscire insieme oppure essere annullati insieme.

I percorsi interessati sono il salvataggio manuale di un **nuovo DDT collegato** e l'azione AI che genera un DDT dal residuo completo. Un DDT autonomo e la modifica di un DDT esistente non diventano transazionali rispetto a un ordine per effetto di questa RPC.

Questo incremento non costituisce un modello completo di eventi di consegna. Non risolve quote documentali lato server, stock, assegnazione affidabile dei lotti, fatturazione atomica, annullamenti o ricostruzione globale di `qtyEv`.

## Contratto e identità della richiesta

- `company_id` e `order_id` identificano l'azienda e l'ordine; l'autorizzazione deve essere verificata sul server e il cliente del DDT deve corrispondere a quello dell'ordine.
- `request_id` identifica una singola intenzione di creazione. Un retry della stessa richiesta conserva questo ID: non generarne uno nuovo dopo un timeout ambiguo.
- `expected_rows` rappresenta le righe dell'ordine viste durante la preparazione. Il server confronta lo snapshot con l'ordine bloccato prima di applicare una nuova operazione. In caso di modifica concorrente, ricaricare e rivedere il documento.
- `document` contiene i dati da salvare e le quantità da consegnare, validate sul server. Il server non deve fidarsi di un `qtyEv` proposto dal client.
- Il registro `customer_ddt_operations` conserva l'identità e il risultato dell'operazione. Il retry con stessa identità e contenuto deve restituire l'esito precedente senza un secondo incremento; il riuso della stessa identità con contenuto diverso deve essere respinto.

Il controllo del replay precede il controllo dello snapshot obsoleto: dopo il primo successo, l'ordine è già cambiato proprio a causa della richiesta. Un timeout della risposta non deve rendere impossibile recuperare quel risultato.

Il wrapper attuale conserva automaticamente l'ID in una mappa in memoria, indicizzata dal payload completo. Il retry automatico è quindi riferito alla stessa pagina e allo stesso payload; ricaricare o chiudere la pagina perde questa memoria. L'ID può essere passato esplicitamente al wrapper, ma non è ancora una coda persistente offline. Il risultato registrato è lo snapshot del primo successo: un replay non rilegge eventuali modifiche o cancellazioni successive del DDT.

## Collegamento delle righe

`source_order_index` è una posizione nella lista di righe dello snapshot atteso, non un identificatore permanente `line_id`. Permette di distinguere righe con codice duplicato nella singola operazione, purché il server confronti l'intero snapshot prima della nuova scrittura.

Più righe DDT possono riferirsi alla stessa posizione, per esempio quando una riga viene divisa per lotto: la somma consegnata deve essere controllata una sola volta contro il residuo di quella riga. Una posizione fuori intervallo, una corrispondenza non valida o una quantità superiore al residuo devono provocare il fallimento dell'intera operazione.

Per una riga priva di indice, il server ammette il collegamento per codice soltanto quando individua una singola riga nell'ordine. Se il codice è duplicato, il salvataggio viene respinto: il server non sceglie una riga arbitraria. Le righe precompilate conservano l'indice anche nello split per lotto.

Non usare questa posizione per ricostruire consegne storiche dopo riordinamenti o eliminazioni di righe. Non convertire in massa i dati legacy né azzerare `qtyEv` esistente. Gli identificatori persistenti di riga e il relativo adeguamento di tutti gli editor restano una fase successiva.

## Ordine del rilascio

1. Applicare prima le migrazioni precedenti e collaudare la nuova migrazione in staging isolato, con dati sintetici.
2. Verificare l'esistenza della RPC e del registro, i privilegi e i test di rollback prima di abilitare il nuovo frontend.
3. Distribuire il frontend e ricaricare le pagine già aperte. Se la migrazione manca, il nuovo percorso deve fallire esplicitamente: **nessun fallback al precedente salvataggio in più chiamate**.
4. Verificare tramite l'API reale entrambi i percorsi, manuale e AI, inclusi timeout della risposta, retry e due sessioni concorrenti.

Durante una distribuzione non coordinata, vecchi client possono continuare a usare le scritture dirette. L'installazione della RPC da sola non converte quelle richieste in operazioni atomiche. Un rollback del frontend riattiverebbe quel percorso: non descriverlo come rollback equivalente in termini di integrità.

Nessun passaggio di questo documento è un'autorizzazione a migrare produzione o effettuare un deploy. Backup, finestra operativa e collaudo staging precedono un eventuale rilascio.

## Limiti residui da non nascondere

Le policy di scrittura diretta e gli editor legacy restano rilevanti. In particolare, la modifica o cancellazione successiva del DDT può non rettificare `qtyEv`; un editor ordine aperto prima della RPC può salvare uno snapshot obsoleto e sovrascrivere le righe aggiornate; la chiusura manuale può modificare `qtyEv` senza evento documentale.

Il registro di creazione non è un archivio completo delle modifiche successive al documento. La transazione garantisce coerenza al momento della creazione tramite questa RPC, non immutabilità futura né impossibilità di aggiramento mediante altri percorsi autorizzati.

L'azione AI composta «genera DDT e fattura» richiede collaudo separato: il piano attuale può risolvere le azioni su dati caricati prima della creazione del DDT. Il successo della creazione atomica non prova il successo della fatturazione successiva.

## Matrice minima di verifica

- Anonimo, viewer e utente di altra azienda respinti; azienda corretta con cliente incoerente respinta.
- Duplicati di codice con quantità e stato di evasione diversi, consegna parziale, split per lotto e più posizioni distinte.
- Indice errato, quantità zero/negativa/non numerica, eccesso sul residuo e snapshot obsoleto: nessuna scrittura parziale.
- Stesso request ID e payload: stesso risultato; stesso ID e payload diverso: rifiuto; retry dopo timeout: nessun nuovo numero o incremento.
- Due richieste diverse sullo stesso residuo: nessuna sovraconsegna. Un test sequenziale non sostituisce un collaudo concorrente con connessioni separate.
- Errore iniettato dopo ciascun passaggio significativo: numerazione, documento, ordine e registro restano coerenti per rollback.
- Numero manuale duplicato e data a cavallo d'anno; l'anno automatico deriva dalla data del DDT.
- Stesso comportamento API nei percorsi manuale e AI; migrazione assente produce errore visibile senza fallback.
- Verifica esplicita del comportamento ancora legacy su modifica/eliminazione DDT e salvataggio ordine obsoleto, senza dichiarare tali limiti risolti.

Le prove locali con PostgreSQL embedded verificano SQL e transazioni, ma non sostituiscono Supabase/PostgREST, autenticazione reale, cache browser e concorrenza di rete. Riportare separatamente questi livelli nel risultato del collaudo.

## Aggiornamento successivo alla fase 0019

Le istruzioni sopra descrivono il primo rilascio della sola creazione atomica e restano un registro storico. Nel branch corrente `0020` protegge il salvataggio degli ordini da snapshot obsoleti; `0021` introduce rettifica e annullamento dei DDT tracciati, con compensazioni quantitative e audit, e `0022` gestisce la fatturazione da DDT. La precedente dichiarazione che ogni modifica/eliminazione DDT rimane legacy non descrive quindi l'intero stato attuale. Lo storico ambiguo senza evidenza di creazione continua a richiedere riconciliazione e non viene ricostruito automaticamente. Il rollout aggiornato, i risultati di staging e i limiti ancora aperti sono in [`STAGING_RUNBOOK.md`](STAGING_RUNBOOK.md) e nel quarto incremento di [`STABILIZATION_AUDIT.md`](STABILIZATION_AUDIT.md). Nessuna di queste estensioni equivale a un collaudo completo browser/mobile o provider reali.
