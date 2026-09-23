# Preparazione alla vendita — 23 settembre 2026

**Esito: lancio commerciale non autorizzabile come pronto.** Destinatari previsti: aziende italiane. Il proprietario ha confermato che identità del venditore, partita IVA, dominio, assistenza e prezzi non sono ancora definiti. Nessun dato commerciale è stato inventato.

## Interventi tecnici di questa revisione

- Recupero password: richiesta con risposta non enumerativa, modulo attivato dal flusso di recupero Supabase, verifica sessione prima dell'aggiornamento, conferma password e minimo 12 caratteri. Nessuna password inserita o modificata per gli utenti reali durante i test.
- Portale Stripe: solo amministratori della propria azienda, customer ricavato dal database e mai dal chiamante, ritorno limitato alle origini consentite. Disponibilità effettiva subordinata alla configurazione del portale nell'account Stripe.
- Nuovi checkout negati lato server salvo `COMMERCIAL_CHECKOUT_ENABLED=true`; interfaccia senza prezzi provvisori e acquisto disabilitato. Gli abbonamenti già presenti non sono cancellati o modificati.
- Il ritorno dal checkout non è più presentato come prova di pagamento.
- Test locali: 469 superati, inclusi recupero account, ruoli, ritorni malevoli, isolamento del customer e chiusura delle nuove vendite.
- Configurazione Auth produzione: Site URL corretto dal vecchio GitHub Pages al Worker attuale; conferma email abilitata; minimo password elevato da 6 a 12 caratteri. Le password esistenti non sono state riscritte.

## Blocchi verificati e criteri di apertura

| Area | Stato / lavoro necessario | Evidenza per considerarla pronta |
|---|---|---|
| Venditore e assistenza | Ragione sociale, P.IVA e contatto da definire dal proprietario | Dati approvati e pubblicati nelle pagine pertinenti |
| Prezzi | Da definire; vecchio catalogo non considerato approvato | Piani, limiti, periodicità e trattamento prezzi approvati; corrispondenza con Stripe verificata |
| Email account | SMTP personalizzato disattivato nel progetto produzione | Dominio scelto e verificato, servizio SMTP configurato, conferma/recupero consegnati a caselle esterne autorizzate |
| Email documenti | Mittente Resend aziendale non configurato, fallback sandbox | Mittente verificato e prove autorizzate di consegna, errori e tentativi ripetuti |
| Stripe | Chiavi presenti non equivalgono a integrazione collaudata; portale da verificare | Sandbox: acquisto, rinnovo, mancato pagamento, disdetta, cambio piano, webhook ripetuti/fuori ordine; configurazione live verificata senza addebiti non autorizzati |
| Termini e privacy | Testi e responsabilità da predisporre sui dati reali del venditore e dei fornitori | Testi approvati, supporto del prodotto agli accordi adottati, versione e accettazione registrate se previste |
| Backup e continuità | Backup puntuale e restore SQL locale già riusciti; servizio continuativo non verificato | Retention, destinazione protetta, budget hosting e responsabile decisi; recupero completo e allarmi provati |
| Assistenza e incidenti | Nessun contatto/SLA definito | Canale reale, tempi dichiarati, responsabilità di intervento e procedure di incidente |
| Carico e dispositivi | Test funzionali superati; capacità commerciale non misurata | Carico coerente con clienti attesi e collaudo dei dispositivi supportati |
| Operazioni storiche | DDT senza ledger non rettificabili; riconciliazioni storiche ambigue da trattare esplicitamente | Limiti comunicati, percorso controllato per rettifiche storiche, nessuna riscrittura automatica dei dati |
| Affidabilità esterna | Outbox email, riconciliazione Stripe e identità dei tentativi persistenti oltre il reload restano da completare/qualificare | Prove di interruzione rete, risposta persa e recupero senza duplicazioni |
| Fatturazione elettronica | Export XML non equivale a invio SDI o conservazione | Definire il servizio offerto e collaudare l'eventuale intermediario prima di promettere funzionalità ulteriori |

## Sequenza di attivazione

1. Raccogliere identità del venditore, prezzi, dominio e assistenza. Non acquistare servizi né sottoscrivere contratti senza importi e autorizzazione specifici.
2. Configurare mittente e SMTP; collaudare registrazione e recupero dall'email fino al nuovo accesso. La conferma email resta richiesta; non disattivarla per aggirare la mancanza del servizio email.
3. Configurare e collaudare Stripe sandbox e portale, quindi verificare la configurazione live e gli accordi commerciali.
4. Completare i controlli operativi e di affidabilità sopra indicati. La prova SQL locale non sostituisce un recupero completo dell'infrastruttura.
5. Aggiornare l'interfaccia con prezzi e testi approvati, poi abilitare `COMMERCIAL_CHECKOUT_ENABLED=true`. Il solo flag non rende il prodotto pronto e non riattiva i pulsanti intenzionalmente disabilitati.

Riferimenti tecnici: https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail e https://docs.stripe.com/api/customer_portal/sessions/create .
