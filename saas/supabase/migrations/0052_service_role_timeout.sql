-- Import da Maestro: tempo massimo per le chiamate del servizio.
--
-- maestro-sync (edge function, ruolo service_role via PostgREST) chiama
-- maestro_import dopo ogni invio di Maestro. Con il confronto delle
-- modifiche (0048-0050) l'import impiega ~10 secondi, ma le richieste
-- ereditavano il limite di 8 secondi del ruolo authenticator: l'import
-- veniva interrotto ogni volta, l'errore finiva solo nella risposta
-- dell'invio e dal 9 al 13 ottobre 2026 nessun documento nuovo è entrato
-- nel gestionale. Il limite del solo service_role (mai usato dal browser)
-- sale a 120 secondi; anon e authenticated restano come sono.
-- Già applicata in produzione il 13/10/2026.
alter role service_role set statement_timeout = '120s';
notify pgrst, 'reload config';
