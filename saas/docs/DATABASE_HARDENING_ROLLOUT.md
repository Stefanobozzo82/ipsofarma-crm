# Collaudo autorizzazioni azienda e vincoli tenant

Le migration 0017 e 0018 sono preparate e provate soltanto in un database locale in memoria. Non sono state applicate in produzione o staging. La fase precedente resta descritta in `HARDENING_ROLLOUT.md`.

## Sequenza

1. Eseguire `npm ci --ignore-scripts` e `npm test` da `saas/`.
2. Su staging isolato, verificare PostgreSQL 15 o superiore, ruolo proprietario delle tabelle, migrazioni 0001–0016 e GRANT effettivi. I test usano PostgreSQL 18.3/PGlite, non l'installazione remota.
3. Distribuire il frontend con i selettori FK espliciti del magazzino prima della migration 0018. Ricaricare client e cache.
4. Applicare 0017 tramite migration runner transazionale. Mantiene aggiornabili `nome`, `piva`, `cf`, `sdi_codice`, `pec`, `indirizzo`, `settings`, `regime_fiscale`; piano, Stripe, id, slug e timestamp sono esclusi dal client. Se il controllo dei privilegi ereditati fallisce, fare rollback e investigare i ruoli personalizzati: non ignorare l'errore.
5. Provare salvataggio impostazioni con admin, negazione con viewer/operatore, registrazione azienda e aggiornamento Stripe in modalità test. Il webhook continua a usare `service_role`; nessuna chiave viene inviata al browser.
6. Seguire il preflight e la validazione esplicita di `TENANT_FK_ROLLOUT.md`. Valutare i lock degli indici e ALTER TABLE su una copia con dimensioni rappresentative; NOT VALID evita la scansione iniziale delle FK, non rende l'intera migration priva di lock.
7. Collaudare API PostgREST e UI magazzino, cicli documentali e cancellazioni. Le FK riguardano colonne relazionali: i link JSON legacy e l'identità delle righe non sono trasformati.

## Esiti attesi e recupero

Le operazioni SQL non autorizzate devono fallire o non trovare righe, senza scritture parziali. La registrazione deve creare azienda trial e membership admin. Le scritture server di abbonamento devono funzionare. Una FK cross-tenant nuova deve fallire anche se il chiamante è membro di entrambe le aziende.

Nessun dato storico viene corretto automaticamente. Una riga già incoerente deve comparire nel preflight e impedire VALIDATE finché un intervento esplicito la corregge. L'aggiornamento di soli campi descrittivi può conservare il vecchio collegamento: NON considerare l'aggiunta NOT VALID come bonifica dello storico.

Prima della futura installazione, registrare ACL e definizioni schema dello staging. Un errore durante l'applicazione deve annullare la transazione. Dopo l'applicazione preferire una correzione in avanti: ripristinare indiscriminatamente GRANT ALL o rimuovere i vincoli riapre le vulnerabilità. Nessun deploy o rollback remoto è parte dei test locali.
