# Isolamento delle relazioni per azienda — migrazione 0018

Questa migrazione aggiunge 22 FK composite `(company_id, riferimento_id)` e indici univoci sui genitori. Non modifica dati, non elimina FK esistenti e non converte collegamenti JSON o numeri documento. I riferimenti a `companies`, `auth.users` e le destinazioni JSON non sono relazioni tra due tabelle tenant e restano invariati.

## Requisiti e ordine operativo

1. Eseguire prima in staging su una copia anonimizzata, dopo le migrazioni precedenti. Verificare `SHOW server_version_num;`: serve PostgreSQL 15 o successivo.
2. Eseguire il preflight sotto con un ruolo amministrativo autorizzato che possa leggere tutte le aziende; con RLS i conteggi potrebbero essere incompleti.
3. Conservare risultati e backup ripristinabile. Le anomalie non bloccano l'aggiunta `NOT VALID`, ma richiedono una correzione manualmente approvata prima della validazione.
4. Applicare 0018 tramite il normale migration runner, in transazione. Gli indici non sono concorrenti: programmare una finestra adatta alla dimensione dei dati. `NOT VALID` evita la scansione delle vecchie righe per le FK, non elimina i lock DDL né il lavoro di creazione indici. La migrazione non è uno script da ripetere dopo un successo.
5. Ripetere preflight, prove applicative e test tra due aziende; poi validare i vincoli, uno alla volta, soltanto con conteggi zero. Non eseguire questi passaggi sulla produzione durante lo sviluppo.

## Compatibilità frontend e PostgREST

Prima di applicare 0018, distribuire e caricare il frontend aggiornato che usa i nomi delle FK originali in `listMovimentiRecenti`: `prodotti!movimenti_magazzino_prodotto_id_fkey` e `depositi!movimenti_magazzino_deposito_id_fkey`. Questi selettori funzionano anche sullo schema precedente e mantengono i campi risposta `prodotti` e `depositi`. Dopo 0018, le vecchie query senza selettore sono ambigue perché le FK originali e composite coesistono: programmare il ricaricamento delle pagine già aperte e verificare la cache del frontend prima della migrazione. Evitare il rollback a un frontend senza selettori mentre 0018 è attiva.

La ricerca nelle query del frontend versionato ha individuato questa sola selezione con relazioni incorporate. I test `movements-query.test.cjs` eseguono il wrapper con client simulato e verificano query, tenant, ordinamento e risposta; non eseguono PostgREST. In staging collaudare la pagina Magazzino attraverso l'API reale sia prima sia dopo 0018, verificando assenza di errore PGRST201.

## Preflight in sola lettura

Ogni conteggio include riferimento inesistente o riferimento a un'altra azienda. I valori null consentiti non sono anomalie. Eseguire prima e dopo 0018:

```sql
select 'prodotti_fornitore_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.prodotti child
where child.fornitore_id is not null and not exists (
  select 1 from public.fornitori parent
  where parent.id = child.fornitore_id and parent.company_id = child.company_id
)
union all
select 'preventivi_cliente_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.preventivi child
where child.cliente_id is not null and not exists (
  select 1 from public.clienti parent
  where parent.id = child.cliente_id and parent.company_id = child.company_id
)
union all
select 'preventivi_oc_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.preventivi child
where child.oc_id is not null and not exists (
  select 1 from public.ordini_cliente parent
  where parent.id = child.oc_id and parent.company_id = child.company_id
)
union all
select 'ordini_cliente_cliente_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.ordini_cliente child
where child.cliente_id is not null and not exists (
  select 1 from public.clienti parent
  where parent.id = child.cliente_id and parent.company_id = child.company_id
)
union all
select 'ordini_cliente_prev_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.ordini_cliente child
where child.prev_id is not null and not exists (
  select 1 from public.preventivi parent
  where parent.id = child.prev_id and parent.company_id = child.company_id
)
union all
select 'ordini_fornitore_fornitore_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.ordini_fornitore child
where child.fornitore_id is not null and not exists (
  select 1 from public.fornitori parent
  where parent.id = child.fornitore_id and parent.company_id = child.company_id
)
union all
select 'ddt_cliente_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.ddt child
where child.cliente_id is not null and not exists (
  select 1 from public.clienti parent
  where parent.id = child.cliente_id and parent.company_id = child.company_id
)
union all
select 'ddt_oc_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.ddt child
where child.oc_id is not null and not exists (
  select 1 from public.ordini_cliente parent
  where parent.id = child.oc_id and parent.company_id = child.company_id
)
union all
select 'fatture_cliente_cliente_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.fatture_cliente child
where child.cliente_id is not null and not exists (
  select 1 from public.clienti parent
  where parent.id = child.cliente_id and parent.company_id = child.company_id
)
union all
select 'fatture_cliente_ddt_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.fatture_cliente child
where child.ddt_id is not null and not exists (
  select 1 from public.ddt parent
  where parent.id = child.ddt_id and parent.company_id = child.company_id
)
union all
select 'fatture_cliente_oc_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.fatture_cliente child
where child.oc_id is not null and not exists (
  select 1 from public.ordini_cliente parent
  where parent.id = child.oc_id and parent.company_id = child.company_id
)
union all
select 'fatture_fornitore_fornitore_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.fatture_fornitore child
where child.fornitore_id is not null and not exists (
  select 1 from public.fornitori parent
  where parent.id = child.fornitore_id and parent.company_id = child.company_id
)
union all
select 'fatture_fornitore_of_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.fatture_fornitore child
where child.of_id is not null and not exists (
  select 1 from public.ordini_fornitore parent
  where parent.id = child.of_id and parent.company_id = child.company_id
)
union all
select 'fatture_fornitore_ddtf_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.fatture_fornitore child
where child.ddtf_id is not null and not exists (
  select 1 from public.ddt_fornitore parent
  where parent.id = child.ddtf_id and parent.company_id = child.company_id
)
union all
select 'note_credito_cliente_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.note_credito child
where child.cliente_id is not null and not exists (
  select 1 from public.clienti parent
  where parent.id = child.cliente_id and parent.company_id = child.company_id
)
union all
select 'note_credito_fattura_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.note_credito child
where child.fattura_id is not null and not exists (
  select 1 from public.fatture_cliente parent
  where parent.id = child.fattura_id and parent.company_id = child.company_id
)
union all
select 'note_credito_fornitore_fornitore_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.note_credito_fornitore child
where child.fornitore_id is not null and not exists (
  select 1 from public.fornitori parent
  where parent.id = child.fornitore_id and parent.company_id = child.company_id
)
union all
select 'note_credito_fornitore_fattura_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.note_credito_fornitore child
where child.fattura_id is not null and not exists (
  select 1 from public.fatture_fornitore parent
  where parent.id = child.fattura_id and parent.company_id = child.company_id
)
union all
select 'movimenti_magazzino_prodotto_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.movimenti_magazzino child
where child.prodotto_id is not null and not exists (
  select 1 from public.prodotti parent
  where parent.id = child.prodotto_id and parent.company_id = child.company_id
)
union all
select 'movimenti_magazzino_deposito_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.movimenti_magazzino child
where child.deposito_id is not null and not exists (
  select 1 from public.depositi parent
  where parent.id = child.deposito_id and parent.company_id = child.company_id
)
union all
select 'ddt_fornitore_fornitore_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.ddt_fornitore child
where child.fornitore_id is not null and not exists (
  select 1 from public.fornitori parent
  where parent.id = child.fornitore_id and parent.company_id = child.company_id
)
union all
select 'ddt_fornitore_of_id_tenant_fkey' as vincolo, count(*) as anomalie
from public.ddt_fornitore child
where child.of_id is not null and not exists (
  select 1 from public.ordini_fornitore parent
  where parent.id = child.of_id and parent.company_id = child.company_id
);
```

Per esaminare le righe di un conteggio non zero, usare lo stesso filtro sostituendo `count(*)` con `child.id, child.company_id, child.<riferimento_id>`. Non correggere automaticamente cambiando azienda, azzerando riferimenti o cancellando righe: una vecchia associazione errata richiede verifica del documento originale.

## Semantica e limiti

Le azioni di cancellazione restano quelle precedenti: NO ACTION per anagrafiche obbligatorie e fornitore prodotto; RESTRICT per il deposito del movimento; CASCADE per il prodotto del movimento; SET NULL per i collegamenti opzionali. Per SET NULL viene indicata soltanto la colonna riferimento: `company_id` non diventa null. Sintassi documentata per [PostgreSQL 15](https://www.postgresql.org/docs/15/sql-createtable.html).

Le FK semplici rimangono intenzionalmente. Le vecchie e nuove azioni SET NULL operano sulla medesima colonna: qualunque scatti prima, l'altra non trova più un riferimento da azzerare. Non serve dipendere dall'ordine dei trigger per i dati validi. I vincoli NO ACTION non vengono introdotti al posto dei SET NULL.

ATTENZIONE allo storico già incoerente: una vecchia FK semplice può ancora eseguire SET NULL o CASCADE su una riga di un'altra azienda finché quell'anomalia non viene corretta. La migrazione preserva tali azioni; non dichiarare lo storico isolato prima di preflight zero e validazione. Anche la cancellazione prodotto con CASCADE dei movimenti resta un rischio storico separato: questa migrazione non è una politica di conservazione del magazzino.

NOT VALID controlla nuovi inserimenti e cambiamenti delle chiavi, compreso `company_id`, ma non bonifica lo storico; aggiornamenti che non cambiano la chiave possono lasciare intatta un'anomalia preesistente. RLS e controllo ruoli rimangono necessari. Questi vincoli non verificano coerenza commerciale tra cliente/fattura/ordine nella stessa azienda e non proteggono riferimenti dentro JSON.

## Validazione successiva

Eseguire ciascun comando separatamente dopo il preflight; se uno fallisce, fermarsi e investigare. Non sopprimere l'errore e non eliminare la FK. È possibile pianificare la validazione in finestre successive mantenendo la protezione sulle nuove chiavi.

```sql
alter table public.prodotti validate constraint prodotti_fornitore_id_tenant_fkey;
alter table public.preventivi validate constraint preventivi_cliente_id_tenant_fkey;
alter table public.preventivi validate constraint preventivi_oc_id_tenant_fkey;
alter table public.ordini_cliente validate constraint ordini_cliente_cliente_id_tenant_fkey;
alter table public.ordini_cliente validate constraint ordini_cliente_prev_id_tenant_fkey;
alter table public.ordini_fornitore validate constraint ordini_fornitore_fornitore_id_tenant_fkey;
alter table public.ddt validate constraint ddt_cliente_id_tenant_fkey;
alter table public.ddt validate constraint ddt_oc_id_tenant_fkey;
alter table public.fatture_cliente validate constraint fatture_cliente_cliente_id_tenant_fkey;
alter table public.fatture_cliente validate constraint fatture_cliente_ddt_id_tenant_fkey;
alter table public.fatture_cliente validate constraint fatture_cliente_oc_id_tenant_fkey;
alter table public.fatture_fornitore validate constraint fatture_fornitore_fornitore_id_tenant_fkey;
alter table public.fatture_fornitore validate constraint fatture_fornitore_of_id_tenant_fkey;
alter table public.fatture_fornitore validate constraint fatture_fornitore_ddtf_id_tenant_fkey;
alter table public.note_credito validate constraint note_credito_cliente_id_tenant_fkey;
alter table public.note_credito validate constraint note_credito_fattura_id_tenant_fkey;
alter table public.note_credito_fornitore validate constraint note_credito_fornitore_fornitore_id_tenant_fkey;
alter table public.note_credito_fornitore validate constraint note_credito_fornitore_fattura_id_tenant_fkey;
alter table public.movimenti_magazzino validate constraint movimenti_magazzino_prodotto_id_tenant_fkey;
alter table public.movimenti_magazzino validate constraint movimenti_magazzino_deposito_id_tenant_fkey;
alter table public.ddt_fornitore validate constraint ddt_fornitore_fornitore_id_tenant_fkey;
alter table public.ddt_fornitore validate constraint ddt_fornitore_of_id_tenant_fkey;
```

Verifica finale: devono comparire 22 righe con `convalidated = true`.

```sql
select conrelid::regclass as tabella, conname, convalidated,
       pg_get_constraintdef(oid) as definizione
from pg_constraint
where connamespace = 'public'::regnamespace
  and contype = 'f'
  and right(conname, 12) = '_tenant_fkey'
order by conrelid::regclass::text, conname;
```

## Prove richieste e recupero

Su dati sintetici di due aziende, verificare per ciascuna relazione: riferimento nella stessa azienda accettato; riferimento all'altra azienda respinto sia in INSERT sia modificando la chiave; null accettato soltanto se la colonna era già nullable; cancellazione del genitore con comportamento storico e `company_id` invariato. Provare inoltre una riga cross-tenant inserita prima di 0018: l'aggiunta riesce, il preflight la individua e VALIDATE fallisce senza modificarla. Verificare i collegamenti circolari preventivo/ordine.

Un errore durante la transazione di installazione deve causare rollback dell'intera transazione. Dopo una migrazione riuscita, preferire una correzione in avanti: rimuovere i nuovi vincoli riaprirebbe la possibilità di riferimenti tra aziende. Non c'è alcun rollback dati da effettuare perché 0018 non riscrive righe.
