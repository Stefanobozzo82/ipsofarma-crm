# Pubblicazione online — 22 settembre 2026

URL: https://ipsofarma-crm-staging.stefanobozzo82.chatgpt.site

Pubblicazione Sites riuscita, accesso riservato al proprietario. L'autenticazione del gestionale e i permessi per azienda rimangono su Supabase. Il sito usa esclusivamente il progetto staging `ffjzhtzavkuwysmabmds`; nessuna modifica al database di produzione.

Sono pubblicati 50 asset, comprese 25 pagine HTML. La copia pubblicata sostituisce URL/chiave Supabase con quelli pubblici dello staging e mantiene il banner che identifica i dati di prova. Non contiene credenziali provider o dati applicativi esportati. Service worker senza cache offline.

## Provenienza e verifica

- Repository applicazione: `Stefanobozzo82/ipsofarma-crm`, branch `stabilization/saas-hardening`, commit `f4af03c7f428ab0c7924f64755456afb8d9fa42b`.
- Sorgente della copia Sites: `5dedaa18b62bcf355bb57b921889f90d9a6affff`.
- Site ID: `appgprj_6ab2589f591881919ce45cf7fb600a31`.
- Deployment ID: `appgdep_6ab2596056d88191915d0dcecd763bc7`, esito `succeeded`.
- Backend: 37 migrazioni; precedente collaudo con 453 test locali e 71 verifiche HTTP.
- Nuova origine: sei verifiche CORS superate sulle tre Edge Function con browser; origine esatta accettata, origine estranea rifiutata.
- Supabase Auth Site URL e redirect di conferma aggiornati al sito; conservati i redirect locali e le impostazioni di sicurezza.

La verifica della pubblicazione usa l'esito nativo di deployment. Il precedente collaudo browser è avvenuto nell'anteprima locale, non costituisce un nuovo test E2E sul dominio online.

## Accesso e limiti

Aprire il link con l'account proprietario del sito. L'applicazione richiede poi il proprio account Supabase: registrarsi e confermare l'email, oppure accedere con un account già esistente nello staging. Gli account sintetici dei collaudi sono stati eliminati.

Email applicative tramite Resend, IA tramite Gemini e abbonamenti Stripe richiedono ancora i rispettivi account/chiavi e prezzi di test. La pubblicazione non li abilita e non trasforma lo staging in un servizio commerciale pronto. Restano necessari collaudi provider, ripristino backup, carico e dispositivi, oltre ai limiti documentati nel runbook.

La copia online ha un repository Sites separato: successivi aggiornamenti della PR GitHub non vengono pubblicati automaticamente. Ripreparare la copia staging e usare il workflow Sites sullo stesso Site ID, senza creare un nuovo sito.
