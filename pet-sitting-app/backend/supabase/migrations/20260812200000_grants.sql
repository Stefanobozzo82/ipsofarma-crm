-- Bug reale scoperto solo con test end-to-end contro Supabase vero: le 19
-- migrazioni precedenti creano tabelle e policy RLS ma non concedono mai i
-- privilegi di base a livello di tabella (SELECT/INSERT/UPDATE/DELETE) ai
-- ruoli anon/authenticated. La RLS filtra le RIGHE, ma senza un GRANT
-- esplicito Postgres nega l'operazione a monte con "permission denied for
-- table" prima ancora di valutare le policy — succede in automatico solo
-- quando si crea una tabella dalla Table Editor di Supabase Studio, non
-- quando si scrive SQL a mano come in questo progetto.
--
-- Fix: concedere tutti i privilegi a anon/authenticated/service_role su ogni
-- tabella/sequenza/funzione esistente in public, e impostare i privilegi di
-- default per ogni oggetto futuro creato dal ruolo che esegue le migrazioni
-- (postgres). La sicurezza reale resta demandata interamente alle policy RLS
-- già definite in 20260812120400_row_level_security.sql e nelle migrazioni
-- successive — questo grant da solo non espone nulla che le policy non
-- permettano già.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
