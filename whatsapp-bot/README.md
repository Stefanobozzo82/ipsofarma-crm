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
- Sposta le prenotazioni dal file a un database (ad esempio Supabase) e avvisa l'operatore a ogni nuova richiesta.
- Fai scrivere informativa privacy e testo del consenso da chi si occupa di GDPR: sono dati sanitari.
- Se vuoi inviare promemoria fuori dalle 24 ore, servono template approvati da Meta.
- Le sessioni sono in memoria: al riavvio si perdono. Per più istanze usa un database.
