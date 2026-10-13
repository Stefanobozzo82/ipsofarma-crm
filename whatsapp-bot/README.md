# Bot WhatsApp per prenotazioni a domicilio (prototipo)

Un solo file (`bot.mjs`), nessuna dipendenza. Serve Node.js 20.6 o superiore.

## Cosa fa

Consenso al trattamento dei dati, menu dei servizi, per chi è la prestazione, fascia oraria, indirizzo, riepilogo e conferma. Le prenotazioni vengono salvate in `bookings.jsonl`. Scrivendo "operatore" si chiede una persona; parole come "dolore al petto" rimandano al 118.

## Avvio a costo zero

1. Vai su developers.facebook.com, crea un'app di tipo "Business" e aggiungi il prodotto **WhatsApp**.
2. Nella sezione "API Setup" trovi un **numero di test** gratuito, il suo **Phone number ID** e un **token temporaneo** (dura 24 ore). Aggiungi il tuo numero personale tra i destinatari di test.
3. Copia `env.example` in `.env` e compila i quattro valori. `VERIFY_TOKEN` lo inventi tu (una parola qualsiasi). `APP_SECRET` è la "Chiave segreta" dell'app su Meta (Impostazioni app → Di base): serve a verificare che le richieste arrivino davvero da Meta.
4. Avvia il bot:

   ```
   node --env-file=.env bot.mjs
   ```

5. Rendi il server raggiungibile da Internet con un tunnel gratuito:

   ```
   cloudflared tunnel --url http://localhost:3000
   ```

6. Su Meta, in "Configuration" del prodotto WhatsApp, imposta come Callback URL `https://<indirizzo-del-tunnel>/webhook` e come Verify token lo stesso valore di `.env`. Poi iscriviti al campo **messages**.
7. Dal tuo telefono scrivi "ciao" al numero di test.

## Prima di usarlo con clienti veri

- Passa a un token permanente (utente di sistema) e a un numero dedicato, dopo la verifica dell'azienda su Meta.
- Le prenotazioni si salvano su Supabase se nel `.env` ci sono `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` (funzione `public.bot_salva_prenotazione`, tabella `bot.prenotazioni`, schema non esposto all'API). Se mancano o Supabase non risponde, ripiegano sul file `bookings.jsonl`. La chiave service_role è un segreto: solo nel `.env`, mai nel codice. Per clienti veri usa un progetto Supabase dedicato al bot, non quello del gestionale.
- Avvisi email all'operatore (nuova prenotazione e richiesta di essere richiamati) con Resend: servono `RESEND_API_KEY` e `ALERT_EMAIL_TO` nel `.env`. L'email di prenotazione non contiene dati del paziente. Con il mittente di prova di Resend (`onboarding@resend.dev`) le email arrivano solo all'indirizzo con cui hai aperto l'account Resend: per altri destinatari verifica un dominio e imposta `ALERT_EMAIL_FROM`.
- Fai scrivere informativa privacy e testo del consenso da chi si occupa di GDPR: sono dati sanitari.
- Se vuoi inviare promemoria fuori dalle 24 ore, servono template approvati da Meta.
- Le sessioni sono in memoria: al riavvio si perdono. Scadono da sole dopo 30 minuti senza messaggi (`SESSION_TTL_MINUTES`, massimo `SESSION_MAX` contemporanee): chi torna dopo riparte dal menu e riaccetta il consenso. Per più istanze usa un database.

## Test automatico

```
npm test
```

(oppure `node --test test.mjs`). Non serve il file `.env`, internet né un account: il test avvia il bot vero in una cartella temporanea con un finto Meta, Supabase e Resend, e simula conversazioni intere. Dura circa 7 secondi. Controlla, tra l'altro:

- la verifica del webhook e della firma di Meta (richieste non firmate scartate);
- la prenotazione completa, con i dati salvati su Supabase e l'email all'operatore senza dati del paziente;
- che nei registri del bot non finisca nulla di ciò che scrive l'utente;
- il rimando al 118, i pulsanti di avvio, il consenso, "Parlare con una persona";
- il ripiego sul file quando Supabase non risponde, e l'email che non parte;
- la scadenza e il tetto delle sessioni;
- i limiti di lunghezza di WhatsApp per pulsanti, voci e testi.

Lancialo dopo ogni modifica a `bot.mjs`. Se un test fallisce, il messaggio dice cosa non va.
