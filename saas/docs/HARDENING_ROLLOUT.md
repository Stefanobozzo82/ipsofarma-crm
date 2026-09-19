# Prima tranche di stabilizzazione: collaudo e compatibilità

Queste modifiche sono preparate sul branch di stabilizzazione. Non effettuano deploy o migrazioni e non risolvono tutte le criticità dell'audit.

## CORS delle funzioni browser

Prima di distribuire `send-email`, `ai-proxy` e `stripe-checkout`, configurare `EDGE_ALLOWED_ORIGINS` nei secret/env dell'ambiente di destinazione. Usare origini HTTP(S) esatte separate da virgole, senza percorsi o slash finale. Esempio sintetico:

```text
https://crm.staging.example,http://localhost:8080
```

Ogni ambiente deve avere la propria lista. Non includere localhost in produzione se non serve. La lista vuota rifiuta tutte le richieste che presentano Origin; `*` e `null` non sono ammessi. La WebView mobile attuale carica un sito HTTPS remoto: autorizzare l'origine del sito effettivamente configurato per quell'ambiente.

Le richieste server senza Origin proseguono verso i normali controlli di autenticazione. CORS limita i browser; non è una barriera per script o client HTTP. Webhook Stripe e cron solleciti restano endpoint server con i rispettivi controlli, senza aggiungere CORS indiscriminatamente.

Verificare in staging OPTIONS e POST da ciascuna origine consentita, un'origine vietata, sessione scaduta, app mobile e risposte errore. Gli header sono calcolati per richiesta e includono `Vary: Origin`.

## Identità email

Il client aggiornato deve includere `company_id`; il backend verifica l'utente nella specifica azienda e accetta soltanto admin e operatore. Nome e reply-to arrivano dalla riga azienda letta sul server, non dai campi di identità nel payload.

Le impostazioni dell'azienda sono modificabili dall'admin: la lettura server-side garantisce il legame con il tenant, non certifica la proprietà della casella email. La verifica del dominio/casella, l'outbox e i limiti invio restano attività successive.

Distribuire prima il frontend aggiornato, compatibile con la vecchia funzione, poi la funzione con l'allowlist configurata. I client vecchi già aperti senza `company_id` saranno rifiutati: prevedere ricaricamento web e app e collaudare il messaggio errore. Non introdurre fallback che scelga una membership arbitraria.

## Copertura ordini fornitore

Le quantità degli ordini collegati sono sommate per codice e consumate una sola volta, nell'ordine delle righe cliente. Il residuo viene generato senza riscrivere lo storico. I collegamenti legacy per numero restano compatibili.

È una correzione quantitativa, non una transazione: due generazioni contemporanee o un errore tra salvataggi possono ancora produrre incoerenze. Identificatori riga, RPC atomiche, annullamento e gestione di ordini condivisi sono nel backlog. Il calcolo di consegna/ricezione `qtyEv` non viene modificato da questa tranche.

## Controlli prima di un eventuale rilascio

Eseguire `npm test` da `saas/`, validare e distribuire solo in staging le tre funzioni con la dipendenza `_shared/cors.ts`, verificare invio con due aziende e ruoli diversi usando destinatari di test. Collaudare le due pagine chiamanti: ordini fornitore e scadenziario.

Per rollback applicativo, ripristinare insieme funzione email e relativi client della versione precedente; non eliminare dati. Tornare alla versione precedente reintroduce i difetti descritti nell'audit. Non è stata applicata alcuna migrazione dati da annullare.
