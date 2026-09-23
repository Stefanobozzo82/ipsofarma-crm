# Stripe: elaborazione verificabile degli eventi

Migrazione 0024: `apply_stripe_event(jsonb)` è eseguibile solo da `service_role`. Registra l'evento e aggiorna azienda/watermark nella stessa transazione; un errore non lascia un evento marcato come elaborato. `stripe_events` contiene ID, tipo, timestamp ed esito, senza il payload cliente completo. Gli ID ripetuti non producono nuove scritture.

Il webhook verifica il corpo originale, timestamp entro cinque minuti e tutte le firme `v1` presenti (rotazione del segreto). Un errore del database, un prezzo sconosciuto/ambiguo o una società non ancora collegata produce una risposta retriable 503, non un falso 200. Gli eventi non gestiti sono registrati come ignorati. Per il periodo viene accettata anche la posizione nell'item subscription.

Il customer viene salvato prima del checkout: ciò permette di applicare eventi subscription arrivati prima di `checkout.session.completed`. Se il customer non è ancora associato, l'evento resta da ritentare. Eventi precedenti al watermark della subscription sono ignorati e la cancellazione costituisce un tombstone contro la riattivazione accidentale. `past_due` mantiene il piano e non cancella né impedisce la lettura dei dati.

Il checkout ammette solo URL HTTP(S) senza credenziali con origine esatta configurata in `EDGE_ALLOWED_ORIGINS`; conserva percorso/query per il ritorno applicativo. Questa è una allowlist di origini, non di singole pagine. Customer e checkout usano chiavi idempotenza deterministiche per azienda e, per il checkout, piano. Un errore della persistenza customer interrompe la creazione della sessione. Un abbonamento esistente non cancellato richiede gestione del precedente: creare un secondo abbonamento non è un flusso di cambio piano.

## Configurazione e rilascio

Usare un progetto e credenziali Stripe **test** in staging. Configurare `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, le variabili Supabase server e `EDGE_ALLOWED_ORIGINS`; mappare ciascun prezzo a un solo piano. Installare 0024 prima del nuovo webhook e verificare i grant reali. Configurare l'endpoint webhook per la verifica Stripe del corpo originale, senza dipendere da un JWT utente. Non inserire segreti nel frontend o nel repository.

Collaudare checkout, eventi ripetuti, ordine invertito, prezzo non mappato, indisponibilità database e ritorno applicativo. Controllare i retry nella dashboard Stripe e gli esiti nel ledger. Dopo aver corretto una mappatura, reinviare l'evento fallito. Non modificare `companies.piano` dal browser.

## Limiti espliciti

Il timestamp Stripe ha precisione al secondo: due eventi diversi con identico `created` non hanno qui un ordine causale dimostrabile. Il sistema non esegue una riconciliazione periodica tramite Stripe GET e non ricostruisce automaticamente eventi mai ricevuti. Eventi appartenenti a una subscription diversa da quella associata richiedono verifica e riconciliazione; non sovrascrivono silenziosamente l'associazione.

Le chiavi idempotenza hanno il periodo di conservazione del provider: non sono un blocco permanente. Sessioni per piani diversi avviate prima del collegamento subscription richiedono ancora una prenotazione checkout unica per azienda; non dichiarare risolta ogni possibile doppia sottoscrizione. Il cambio piano e il customer portal non sono implementati da questa modifica.

I test locali esercitano il motore SQL e gli handler reali con provider/client simulati. Non sono transazioni Stripe reali, né prova di configurazione dei webhook in produzione o staging.
