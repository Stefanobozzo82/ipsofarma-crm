# Fattura cliente da DDT: incremento 0022

`create_customer_invoice(p_company_id,p_ddt_id,p_request_id,p_expected_ddt,p_document)` crea una fattura per l'intero DDT e registra insieme numero, fattura, marker sul DDT, riferimenti ordine e risultato idempotente in `customer_invoice_operations`. Il lock dell'ordine precede quello del DDT, coerentemente con il ciclo di consegna. Un errore annulla tutte le scritture.

Lo snapshot contiene `cliente_id`, `oc_id`, `righe`, `extra:{ftId,annullato}`. Il documento contiene data, numero opzionale, cliente/ordine coerenti, destinazione e righe. Le quantità devono coprire esattamente tutte le posizioni del DDT; `source_ddt_index` è un indice dello snapshot, non una identità persistente. Codici univoci ammettono fallback; duplicati senza indice sono respinti. Prezzi e sconti sono modificabili prima della creazione. Un DDT annullato, già marcato fatturato o già collegato a una fattura non può essere fatturato di nuovo.

Manuale nuovo documento con DDT e generazione headless passano dalla RPC senza fallback. Le fatture autonome mantengono il precedente percorso. Il client usa il numero automatico quando l'anteprima non è stata modificata.

Il trigger impedisce al client di inserire una nuova fattura collegata, cambiare il collegamento, alterare dati e righe di una fattura collegata o cancellarla. Gli UPSERT di incassi restano consentiti per lo stesso ID/tenant/DDT; i campi documento devono rimanere identici. Il form nasconde salvataggio/cancellazione dei documenti collegati e consente ancora gli incassi. Una rettifica richiede un futuro flusso di storno: non si implementa una cancellazione fisica di ripiego. Scritture amministrative/service-role richiedono procedure controllate.

Applicare la migrazione in staging e distribuire il frontend coordinato. Vecchi client che creano fatture collegate con INSERT vengono respinti. Verificare incassi, SDI e query PostgREST sullo stack reale; i test locali con fixture di ruoli non dimostrano la configurazione di Supabase remoto. Un rollback del solo frontend non ripristina compatibilità.

La pianificazione AI «DDT e fattura» rilegge i DDT immediatamente prima della fatturazione, conservando l'ID dell'ordine scelto ed escludendo annullati e già fatturati. Un'anteprima senza DDT non disabilita la fase successiva alla creazione; nessun documento disponibile e fallimenti producono un esito di errore, non un successo generico.

Limiti: ogni DDT è fatturato con una transazione separata; una richiesta AI su più DDT può completarne alcuni prima di incontrare un errore. Note credito/storni, registro immutabile dei pagamenti e concorrenza di incassi non sono risolti da questa migrazione. La quota documentale è gestita separatamente dalla migrazione 0027. Le righe storiche non vengono convertite o corrette automaticamente.

Test specifici: SQL locale di quantità duplicate/split, autorizzazioni, snapshot, cancellazione, replay, guard dirette, compatibilità UPSERT pagamento e rollback iniettato su ciascuna scrittura; wrapper di pagina reale e cascata con client simulato. Collaudare separatamente richieste simultanee con connessioni reali, timeout di rete e browser.
