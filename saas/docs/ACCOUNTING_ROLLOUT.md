# Fase 5 — Fatture fornitore, pagamenti e ordini

Stato: migrazioni fino alla 0037 applicate in staging; vedere le evidenze aggiornate in fondo. Nessuna dichiarazione di completezza commerciale o fiscale.

## Contratti e ordine di rilascio

Applicare 0031, 0032 e 0033 dopo 0030, verificare privilegi e cache PostgREST, quindi pubblicare insieme wrapper e pagine aggiornate. Una vecchia pagina che tenta scritture dirette protette riceve un errore: ricaricarla, senza disabilitare i trigger.

- **0031**: `create_supplier_invoice(company_id, ddt_id, request_id, expected_ddt, document)` blocca il DDT, confronta lo snapshot e crea fattura, collegamenti DDT/ordine e registro operazione nella stessa transazione. Restituisce `{fattura, ddt, ordine, replayed}` con righe SQL. DDT annullati o già fatturati sono respinti; le quantità fatturate devono coprire esattamente le righe sorgenti. `source_ddt_index` distingue i codici duplicati; il fallback per codice è consentito solo se unico. `create_standalone_supplier_ddt(company_id, request_id, document)` salva anche l'eventuale collegamento a una fattura esistente, senza una seconda scrittura client. Non cambia le quantità ricevute di un ordine.
- **0032**: `mutate_invoice_payment(company_id, kind, invoice_id, request_id, action, payload)` accetta `customer`/`supplier` e azioni `add`, `settle`, `remove`, `clear`. Blocca la fattura, ricalcola saldo e residuo considerando le note di credito e registra stato precedente/successivo. `remove` usa l'identificatore pagamento; per righe legacy serve indice più snapshot esatto. `clear` richiede snapshot di pagamenti, flag e data saldo. Scritture dirette sui pagamenti sono negate. Le modifiche delle note di credito sincronizzano lo stato delle fatture collegate.
- **0033**: `update_supplier_order(company_id, order_id, expected, document)` confronta `num`, `data`, `fornitore_id`, `ftf_ids`, `righe`, `extra` sotto lock. Preserva quantità ricevute, metadata e collegamenti. Gli indici temporanei delle righe identificano lo snapshot atteso; non sono identità permanenti. Un ordine con ricezioni tracciate mantiene la struttura delle righe e il fornitore.

Le RPC sono riservate ai membri admin/operatore dell'azienda. I registri idempotenza sono privati. Una chiave riutilizzata con attore o contenuto diverso viene rifiutata; un replay restituisce il risultato originario, che può non essere più lo stato corrente del documento. Il wrapper pagamenti unisce richieste simultanee identiche, conserva la chiave dopo errore e ne crea una nuova dopo successo: due pagamenti intenzionali uguali restano possibili.

## Evidenza ripetibile

Suite dedicate: `atomic-supplier-invoice`, `supplier-invoice-client`, `supplier-receipt-client`, `atomic-payments`, `payment-client`, `payment-wrapper-race`, `supplier-invoice-payment-integration`, `index-security` e suite ordini fornitore. Eseguirle tramite i comandi di `tests/README.md`, poi l'intera suite.

La verifica combinata sullo schema 32 copre creazione fattura fornitore, saldo tramite RPC, rifiuto dell'aggiornamento diretto del flag saldo e collegamento di un DDT autonomo a fattura già pagata senza perdere movimenti. I test browser simulati verificano escaping delle aziende e anteprima invito come testo, oltre alla race tra richieste pagamento esplicite. Queste prove non sostituiscono E2E browser, concorrenza PostgreSQL su connessioni distinte o riconciliazione bancaria.

## Limiti operativi

- Note di credito storiche riferite a più fatture richiedono allocazione esplicita; non si divide arbitrariamente un importo. Collegamenti o quantità storiche ambigue richiedono riconciliazione amministrativa. Non sono implementati tutti i flussi di storno, rimborso o integrazione fiscale.
- Una fattura legacy marcata saldata senza movimenti mantiene tale informazione senza inventare incassi. Prima di aggiungere o rimuovere movimenti va riaperta esplicitamente. Il comando di saldo registra il residuo: è un'azione manuale dell'operatore, non la prova di un incasso bancario. Una riapertura non equivale a un rimborso.
- Le chiavi automatiche client vivono nella pagina. Dopo chiusura o ricarica e risposta incerta, verificare il documento/registro prima di generare un'altra operazione. Non esiste una outbox durevole per email o solleciti; invio provider e consegna restano eventi distinti.
- Provider IA, email e Stripe richiedono collaudo con credenziali di test. Gli esiti IA incerti consumano il tentativo; Stripe richiede ancora riconciliazione remota e gestione completa degli eventi temporalmente indistinguibili.
- Restore di backup, storage e configurazione non ancora dimostrato. Nessun downgrade distruttivo automatico. Il piano di ripristino va provato in un ambiente separato.
- Nessun movimento automatico di magazzino aggiunto. La fatturazione di più DDT in un'unica fattura e tutti i percorsi di rettifica/annullamento fattura non sono coperti da questa tranche. Le prove sotto carico e la matrice completa delle gare concorrenti restano necessarie.

## Evidenze aggiornate — fase 5, 19 settembre 2026

Questo paragrafo sostituisce i precedenti conteggi e i limiti browser degli incrementi storici. Suite locale completa: **413 test superati**, zero fallimenti (`outputs/validation-phase5.txt` nel workspace). In staging sono applicate le migrazioni **0031–0033**, per un totale di **33**; smoke HTTP Auth/PostgREST ed Edge: **44 asserzioni superate** (`outputs/staging-http-phase5.txt`). Successivamente applicata anche **0034**, per un totale corrente di **34 migrazioni**: lint remoto senza errori o avvisi, smoke HTTP ripetuto con 44 asserzioni superate e dry-run aggiornato senza migrazioni pendenti. I 413 test completi sono riferiti allo schema 33; ulteriori 32 test mirati sono superati sullo schema 34 e non vengono sommati al totale, perché ripetono copertura esistente.

Percorso nel browser reale: accesso con account sintetico, selezione azienda, ordine di 10 pezzi, DDT parziale di 3 pezzi al prezzo di 10 euro con IVA 0%, fattura da 30 euro, incasso parziale di 10 euro e saldo del residuo di 20 euro, fino al 100%. Il difetto che sostituiva IVA 0 con l'aliquota predefinita è stato osservato prima della correzione e verificato corretto dopo.

Nel viewport mobile di 390 pixel, le schermate pagamenti e collegamenti documentali risultano leggibili; misura DOM `documentWidth = clientWidth = 375`, senza overflow orizzontale del documento. È una verifica di viewport nel browser, non un collaudo completo su dispositivo mobile o di tutti i percorsi E2E. Le fixture browser sono state rimosse con SQL limitato agli identificativi di prova e la pulizia è stata verificata.

Restano da collaudare provider reali, restore e tutte le gare concorrenti. Restano da completare outbox durevole, riconciliazione dello storico ambiguo e allocazioni delle note credito legacy multiple, ciclo completo storni/rimborsi e integrazioni fiscali. Il saldo manuale non prova un incasso bancario. Queste evidenze non dichiarano il prodotto commercialmente completo o pronto alla produzione.

## Incremento 0035 — ciclo note di credito

`save_credit_note(company_id, kind, request_id, expected, document)` crea o aggiorna NC/NCF con snapshot completo, numero e sincronizzazione saldi nella stessa transazione. `expected` contiene id, numero, data, soggetto, fattura, righe ed extra. Soggetto e fattura sono immutabili per documenti esistenti: una correzione richiede annullamento e nuova emissione. Le note autonome restano supportate; i collegamenti legacy privi di UUID richiedono riconciliazione esplicita.

`cancel_credit_note(company_id, kind, request_id, expected, reason)` richiede amministratore e motivo, conserva il documento annullato e riallinea i saldi. Le UI NC/NCF non usano più salvataggi, cancellazioni o numerazione separati; mantengono metadata e IVA zero. Le note annullate restano consultabili e non concorrono agli aggregati delle fatture. I retry della stessa operazione mantengono la chiave; aprire un nuovo form crea una nuova intenzione anche con dati identici.

Verifica locale: 8 test SQL della 0035 e 10 test comportamentali frontend/wrapper superati. La 0035 è ora applicata in staging; questi test locali restano distinti dalle verifiche HTTP, E2E browser e dalla riconciliazione bancaria. Restano valide le limitazioni sullo storico ambiguo, rimborsi, provider, outbox e restore.

## Stato corrente — chiusura core contabile, schema 37

Applicate in staging anche le migrazioni **0035–0037**, per **37 migrazioni totali**, con lint remoto senza errori o avvisi. Il ciclo atomico NC/NCF e il completamento manuale ordini con audit sono implementati: non sono più lacune aperte. Il completamento manuale è amministrativo, richiede motivo e snapshot, non prova consegna fisica e non genera movimenti magazzino. La 0037 impedisce rinumerazioni che spezzerebbero riferimenti legacy nelle note di credito.

Validazione finale sullo schema 37: **453/453 test della suite completa superati** in circa 94 secondi; **71/71 asserzioni HTTP superate**, pulizia fixture verificata e lint remoto senza errori o avvisi. I risultati precedenti rimangono evidenze storiche nei paragrafi sopra.

Restano aperti: account/credenziali e collaudo provider (risposta utente ancora mancante), backup e restore provato, stress delle gare concorrenti, copertura mobile/dispositivi estesa, riconciliazione dello storico ambiguo, outbox email durevole e casi Stripe con eventi nello stesso secondo o checkout distinti per lo stesso piano/piani diversi. Non viene dichiarata prontezza commerciale o produzione.
