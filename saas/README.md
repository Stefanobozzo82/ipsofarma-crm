# Dal monolite al SaaS — Fase 0, Fase 1, Fase 2 (in corso)

Questa cartella è il punto di partenza del **nuovo prodotto multi-azienda**, costruito
in parallelo al gestionale che usi ogni giorno. Niente qui tocca `index.html`,
`backup.json` o `catalogo.json`: l'app Ipsofarma continua a funzionare esattamente
come oggi, sincronizzata su GitHub come sempre.

Il piano completo (diagnosi, stack, fasi, costi) è nel documento
"Dal monolite al SaaS" già condiviso. Questa cartella copre la **Fase 0**
(fondamenta dati), la **Fase 1** (accessi) e l'inizio della **Fase 2**
(il primo modulo reale del gestionale collegato a Supabase).

## Cosa c'è qui

```
saas/
├── README.md                         questo file
├── .env.example                      variabili d'ambiente (mai committare quelle vere)
├── web/
│   ├── index.html                    login + registrazione azienda + scelta azienda
│   ├── clienti.html                  anagrafica clienti
│   ├── ordini.html                   ordini cliente, con numerazione
│   ├── ddt.html                      DDT, collegato a un ordine (facoltativo)
│   ├── fatture.html                  fatture cliente, con stato di incasso
│   ├── fornitori.html                anagrafica fornitori
│   ├── ordini-fornitore.html         ordini fornitore, con numerazione
│   ├── fatture-fornitore.html        fatture fornitore, con stato di pagamento
│   └── app/
│       └── store.js                  adattatore di persistenza (sostituisce ghSave/ghLoad)
└── supabase/
    ├── functions/
    │   └── ai-proxy/index.ts             Edge Function: la chiave IA resta lato server (Fase 3)
    └── migrations/
        ├── 0001_aziende_e_utenti.sql        tabella aziende, utenti↔aziende, ruoli, funzioni di isolamento
        ├── 0002_anagrafiche.sql             clienti, fornitori, prodotti
        ├── 0003_documenti.sql               preventivi, ordini, ddt, fatture, note di credito
        ├── 0004_numerazione.sql             numerazione documenti atomica (OC/OF/DDT/FT/...)
        ├── 0005_registrazione_azienda.sql   registrazione self-service di una nuova azienda (Fase 1)
        └── 0006_fatturapa.sql               generazione XML FatturaPA (Fase 4, invio non incluso)
```

## Cosa NON c'è ancora (di proposito)

- **Note di credito** (cliente e fornitore): tabelle già pronte dalla Fase 0, nessuna pagina ancora.
- **Invio reale allo SDI**: l'XML si genera (Fase 4), ma trasmetterlo richiede un
  account presso un provider esterno che l'azienda dovrà scegliere e attivare da sé.
- **Nessun abbonamento/Stripe**: Fase 5.

Costruire solo le fondamenta prima, e verificarle bene, evita di dover rifare lo
schema dati una volta che ci sono già clienti sopra.

## Come attivarlo (circa 10 minuti)

1. **Crea un progetto Supabase gratuito** su [supabase.com](https://supabase.com) —
   bastano un'email e il nome del progetto, nessuna carta richiesta per il piano free.
2. Apri **Project Settings → API** e annota:
   - `Project URL`
   - `anon public key`
   - `service_role key` (questa è segreta: mai nel codice, mai su GitHub — vedi `.env.example`)
3. Apri **SQL Editor** nel pannello Supabase ed esegui i 5 file dentro
   `supabase/migrations/` **in ordine numerico**, uno alla volta, incollando il
   contenuto e premendo *Run*.
4. Verifica che l'isolamento funzioni davvero (vedi sotto, "Come verificare").
5. Copia `.env.example` in `.env.local` (dentro `saas/`, mai nella root del repo) e
   incolla i tuoi valori. Questo file non va mai committato.
6. In `web/index.html`, sostituisci `SUPABASE_URL_DA_COMPLETARE` e
   `SUPABASE_ANON_KEY_DA_COMPLETARE` con `Project URL` e `anon public key` (sono
   valori pubblici, protetti dalla RLS — a differenza della service_role key non
   vanno mai trattati come segreti). Poi apri la pagina in un browser per
   collaudare login, registrazione azienda e ruoli sul progetto reale.

## Perché questo schema, non un altro

Ogni documento (fattura, ordine, DDT...) ha una manciata di **colonne reali**
(`company_id`, `num`, `data`, il cliente/fornitore collegato, `paid`) che servono
per l'isolamento tra aziende, gli indici e i vincoli di unicità del numero
documento — e una colonna **`righe` in formato JSON**, con la stessa identica
forma che il gestionale già produce oggi (`cod`, `descr`, `qty`, `prezzo`,
`sconto`, `iva`, `lotto`, `scad`).

Questo è deliberato: quando arriveremo alla Fase 2, le funzioni che già esistono
nel gestionale per calcolare totali, IVA e scissione dei pagamenti dovranno
cambiare pochissimo, perché lavorano su righe fatte esattamente così. Non
stiamo ridisegnando la logica del gestionale — stiamo solo dando alle sue
tabelle un database vero sotto, con l'isolamento e le transazioni che
`backup.json` non può offrire.

## Isolamento tra aziende: come funziona

Ogni tabella ha **Row Level Security (RLS)** attiva. In pratica: anche se una
query nel frontend avesse un bug e chiedesse "dammi tutte le fatture", il
database restituirebbe comunque solo le righe della azienda a cui l'utente
collegato appartiene — mai quelle di un'altra azienda cliente. L'isolamento non
dipende dal codice dell'app, dipende dal database stesso: è la differenza
fondamentale rispetto a oggi.

## Numerazione documenti: perché non si romperà più

Il bug dei contatori che abbiamo inseguito questa sessione (numeri duplicati,
contatori che tornano indietro tra dispositivi) esisteva perché `backup.json`
non ha un modo per far sì che "il prossimo numero libero" sia deciso in modo
sicuro quando più dispositivi scrivono insieme. La funzione
`next_document_number()` in `0004_numerazione.sql` risolve questo alla radice:
Postgres garantisce che, anche con cento richieste simultanee, ogni numero
venga assegnato una volta sola. Non è una correzione — è un problema che con
questo schema non può più esistere.

## Come verificare che funzioni (prima di fidarti)

Nel SQL Editor di Supabase:

```sql
-- 1. crea due aziende di prova
insert into companies (slug, nome) values ('prova-a', 'Azienda Prova A') returning id;
insert into companies (slug, nome) values ('prova-b', 'Azienda Prova B') returning id;

-- 2. la numerazione è indipendente per azienda e non collide mai
select next_document_number('<id-azienda-a>', 'FT', 2026); -- FT/2026/0001
select next_document_number('<id-azienda-a>', 'FT', 2026); -- FT/2026/0002
select next_document_number('<id-azienda-b>', 'FT', 2026); -- FT/2026/0001 (aziende diverse, contatori diversi)
```

Poi, da **Authentication → Users**, crea due utenti di test, collegali a
`memberships` (uno per azienda), e verifica dal client Supabase che l'utente
dell'azienda A non veda mai righe dell'azienda B.

## Fase 1 — registrazione self-service di un'azienda

`0005_registrazione_azienda.sql` aggiunge:

- **`register_company(nome, slug)`**: l'unico modo per un utente appena
  autenticato di creare un'azienda. Fa in una sola transazione atomica
  quello che altrimenti richiederebbe due scritture separate (le policy RLS
  della Fase 0 impediscono di proposito a un utente senza membership di
  scrivere direttamente su `companies` o `memberships`): crea l'azienda e
  rende chi l'ha chiamata il suo primo admin. Se lo slug è già in uso,
  restituisce un errore leggibile invece di un codice tecnico.
- **`my_memberships`**: la vista che il client interroga subito dopo il
  login — "a quali aziende appartengo, con che ruolo" — per decidere se
  mostrare "crea la tua azienda" oppure aprire il gestionale.

`web/index.html` è il banco di prova: login/registrazione utente (email +
password), poi — se l'utente non appartiene ancora a nessuna azienda — un
form per crearne una, poi una vista che conferma azienda e ruolo. Non è
l'interfaccia finale, serve a verificare che l'intero percorso funzioni
prima di adattare il gestionale vero nella Fase 2.

Verificato prima su Postgres locale (login di due utenti indipendenti,
isolamento reciproco, slug duplicato rifiutato) e poi con un test
automatico della pagina stessa (Playwright, Supabase simulato) prima di
collegarla al progetto reale.

## Fase 2 (iniziata) — l'adattatore di persistenza

`web/app/store.js` è il pezzo più delicato della Fase 2: il rimpiazzo di
`ghSave`/`ghLoad`/`ghBootSync`/`persist()` di `index.html`. Non tocca né
riscrive la logica del gestionale — offre solo un modo diverso di leggere e
scrivere gli stessi oggetti (`{id, num, data, clienteId, righe, paid, ...}`)
che il gestionale già usa, stavolta contro Supabase invece che GitHub:

- `loadCompany(companyId)` → ricompone un oggetto `{clienti:[...], ordiniCliente:[...], ...}`,
  equivalente a ciò che oggi restituisce `ghFetchBoth()`.
- `saveDoc(collezione, doc, companyId)` → un `upsert`: con `id` aggiorna,
  senza `id` crea (l'id lo assegna Postgres).
- `removeDoc(collezione, id)`, `nextNumber(companyId, prefisso, anno)` (usa
  `next_document_number()`, vedi Fase 0), più `signUp/signIn/signOut`,
  `myMemberships`, `registerCompany` (Fase 1).
- Ogni campo dell'oggetto che non ha una colonna dedicata finisce
  automaticamente nella colonna `extra` invece di andare perso — collaudato
  esplicitamente con un campo "inventato" che sopravvive al giro completo
  salva→ricarica.

**Una decisione di disegno ancora aperta, non presa qui di proposito**:
`nextNum()`/`consumeNum()` nel gestionale attuale sono *sincrone*
(`DB.counters[t]++`), mentre `nextNumber()` qui è *asincrona* (una vera
chiamata di rete, l'unica che garantisce numerazione mai duplicata).
Collegare questo store ai punti del gestionale che creano documenti
richiederà rendere asincrono anche quel passaggio — è la prossima cosa da
decidere insieme prima di procedere oltre.

**Collaudo**: la logica di mappatura è stata verificata due volte, in modo
complementare — (1) il file `store.js` vero, in un browser reale, con un
Supabase simulato (Playwright), e (2) la stessa identica sequenza di
chiamate contro il progetto Supabase reale via REST diretto (due utenti
indipendenti, azienda, cliente, ordine con `righe` e un campo fuori mappa,
numerazione, isolamento reciproco) — poi ripulita senza lasciare tracce.
Non è stato possibile, in questo passaggio, collaudare `store.js` con un
browser reale *e* una rete reale insieme: il sandbox di sviluppo usato in
questa sessione ha un limite di rete specifico (non regge le richieste
HTTP/2 di Chromium verso host esterni) che non riguarda i browser reali
degli utenti finali.

## Fase 2 (in corso) — il primo modulo reale: clienti

`web/clienti.html` è il primo pezzo vero del gestionale collegato a
`store.js`, non più un banco di prova: elenco, creazione, modifica ed
eliminazione dei clienti di un'azienda, letti e scritti davvero su
Supabase. Volutamente parte da clienti/fornitori — anagrafiche semplici,
senza numerazione — proprio per provare tutto il percorso (sessione →
azienda scelta → lettura → scrittura → rilettura) prima di affrontare i
documenti, che in più richiedono la numerazione asincrona descritta sopra.

Da `web/index.html`, ogni azienda nell'elenco ha ora un pulsante "Apri
gestionale →": salva l'azienda scelta in `localStorage`
(`saas_company_id`/`saas_company_nome`) e apre `clienti.html`. Più aziende
per lo stesso utente (es. un commercialista con più clienti) sono già
gestite: si sceglie quale aprire a ogni accesso.

Aggiunta anche `loadCollection(collezione, companyId)` a `store.js`: come
`loadCompany()` ma per una sola collezione, per non dover scaricare tutte
e dieci le tabelle solo per mostrare un elenco.

**Collaudo**: `clienti.html` è stata verificata con un `SaasStore` finto
(Playwright, browser reale) — creazione, modifica con precompilazione del
form, cancellazione con conferma, validazione del nome obbligatorio,
redirect a `index.html` se non si è collegati o non si è scelta
un'azienda, pulizia dello stato al logout. La logica di lettura/scrittura
sottostante (`store.js`) resta quella già collaudata contro il progetto
Supabase reale nel passaggio precedente.

## Fase 2 (in corso) — il primo documento: ordini cliente

`web/ordini.html` è il primo modulo che tocca un **documento numerato**,
non solo un'anagrafica: elenco, creazione (con righe multiple e calcolo
del totale), modifica ed eliminazione di ordini cliente. La differenza
rispetto a `clienti.html` è tutta nella numerazione — qui presa davvero
sul serio, non aggirata:

- In creazione, `store.nextNumber(companyId, 'OC', anno)` viene chiamata
  **prima** di `saveDoc()` e il risultato diventa il `num` del documento —
  collaudato esplicitamente che l'ordine delle due chiamate sia questo e
  non il contrario.
- In modifica, il numero esistente non cambia mai: non viene richiesto un
  nuovo numero solo perché si salva di nuovo lo stesso documento —
  anche questo collaudato esplicitamente.
- L'attesa di rete per ottenere il numero (impercettibile nell'uso reale,
  ma reale) è la conseguenza pratica della decisione presa: la
  numerazione qui è sempre asincrona, a differenza di `nextNum()` nel
  gestionale attuale.

Il form delle righe (codice, descrizione, quantità, prezzo, IVA) è
volutamente un sottoinsieme di quello vero — manca sconto, lotto,
scadenza: l'obiettivo di questo modulo è provare il meccanismo
(numerazione + righe + collegamento a un cliente), non ancora la parità
completa dei campi.

**Collaudo**: `ordini.html` verificata con un `SaasStore` finto (Playwright,
browser reale) — calcolo del totale su più righe con aggiunta/rimozione
dinamica, ordine delle chiamate numerazione→salvataggio, nessuna nuova
numerazione in modifica, validazioni (nessun cliente, nessuna riga
valida), elenco con cliente risolto. Rieseguiti anche i test di
`clienti.html` e `index.html` per la voce di navigazione aggiunta.

## Nota operativa: impostazioni Auth temporaneamente cambiate

Per sbloccare i test (il servizio email gratuito di Supabase ha un limite
di invii molto basso, superato più volte durante lo sviluppo), la
conferma email obbligatoria è stata **disattivata temporaneamente**
(`mailer_autoconfirm: true`) sul progetto reale. Va riattivata prima di
avere il primo cliente vero — senza conferma email chiunque potrebbe
registrarsi con un indirizzo non suo. La soluzione definitiva, comunque
necessaria prima di vendere il prodotto, è collegare un provider email
vero (Fase 5/6): il limite gratuito integrato scatterebbe comunque anche
con pochi utenti al giorno.

## Fase 2 (in corso) — DDT e fatture: documenti collegati fra loro

`web/ddt.html` e `web/fatture.html` completano il primo giro di moduli
documento. Cosa aggiungono rispetto a `ordini.html`:

- **Collegamento a un altro documento, non solo a un'anagrafica.** Un DDT
  può (facoltativamente) riferirsi a un ordine (`ocId`); una fattura può
  riferirsi sia a un ordine sia a un DDT (`ocId` e `ddtId`). Il menu a
  tendina si aggiorna in base al cliente scelto; selezionare l'ordine (o
  il DDT) precompila le righe per comodità, solo se non ne erano già state
  scritte — collaudato esplicitamente in entrambi i casi.
- **Stato di incasso sulle fatture**, con la stessa identica forma di dati
  già usata oggi in `index.html` (`paid`, `paidDate`,
  `pagamenti:[{data, importo}]`): un pulsante nell'elenco commuta tra
  "da incassare" e "incassata", impostando la data odierna e l'importo
  pari al totale del documento — o azzerando tutto se si torna indietro.
  Punto collaudato esplicitamente: **modificare una fattura non tocca mai
  lo stato di incasso già impostato** (il salvataggio in modifica non
  include affatto quei campi, a differenza della creazione che li
  inizializza a "non incassata").
- Navigazione coerente in tutte e quattro le pagine (Clienti · Ordini ·
  DDT · Fatture), con la voce della pagina corrente evidenziata.

**Collaudo**: entrambe le pagine verificate con `SaasStore` finto in un
browser reale — precompilazione delle righe da ordine/DDT, collegamento
corretto salvato, DDT creabile anche senza ordine collegato (campo
davvero facoltativo), toggle dell'incasso in entrambe le direzioni con i
valori esatti, e — il caso più delicato — la modifica di una fattura che
lascia intatto lo stato di incasso. Rieseguita l'intera suite precedente
(`index.html`, `clienti.html`, `ordini.html`) per la navigazione condivisa
aggiornata.

## Fase 3 (in corso) — la chiave IA non è più nel browser di nessuno

`supabase/functions/ai-proxy/index.ts` è la prima Edge Function del
progetto: l'unico punto di passaggio verso Gemini. Il browser non vede mai
la chiave — sta solo sul server, come secret del progetto Supabase, non
nelle impostazioni di un'azienda come oggi in `index.html`.

Il corpo della richiesta accettato è volutamente identico a quello che
`aiComplete()` in `index.html` già costruisce per il provider `openai`
(l'endpoint compatibile OpenAI di Gemini): `{model, temperature,
max_tokens, messages}`. Quando l'assistente IA verrà collegato al
prodotto multi-azienda, cambierà solo *a chi* viene mandata la richiesta,
non come viene costruita.

Tre controlli in sequenza, in ordine di severità crescente:
1. **Chi chiama deve essere un utente autenticato vero**, non solo chi
   possiede la chiave pubblica `anon` (che chiunque legge aprendo la
   pagina) — verificato con `supabase.auth.getUser()` sul token del
   chiamante, non su credenziali del server.
2. **Deve appartenere ad almeno un'azienda** (interroga `my_memberships`):
   un account creato ma non ancora collegato a una company non può
   consumare la quota IA condivisa.
3. **La chiave deve essere configurata sul server** (`GEMINI_API_KEY` come
   secret del progetto Supabase, mai nel codice né nel repository).

Distribuita con `supabase functions deploy --use-api` (bundling lato
server, niente Docker — non disponibile in questo ambiente di sviluppo).
`verify_jwt` attivo: Supabase stesso rifiuta le richieste senza un token
valido prima ancora che la funzione parta, oltre al controllo che la
funzione fa comunque per conto proprio.

**Collaudato sul progetto reale**, tre casi in sequenza: nessun token →
401 "Missing authorization header" (Supabase stesso, prima della
funzione); token valido ma utente senza nessuna azienda → 403 "nessuna
azienda associata"; utente con azienda ma chiave non ancora configurata
sul server → 500 "chiave IA non configurata sul server". Dati di prova
ripuliti subito dopo. Manca l'ultimo passo — una vera chiave Gemini
impostata come secret, per collaudare anche la chiamata reale a Gemini —
in attesa che l'utente ne fornisca una.

**Fase 3 completata**: chiave Gemini impostata come secret del progetto,
collaudata con una vera chiamata attraverso `ai-proxy` (utente autenticato
+ azienda reale → risposta vera di Gemini). Dati di prova ripuliti.

## Fase 4 (avvio) — generazione XML FatturaPA

`supabase/migrations/0006_fatturapa.sql` costruisce la parte di
fatturazione elettronica che **non dipende dal provider SDI** scelto in
futuro (Aruba o un altro): il documento XML nel formato ufficiale
richiesto dall'Agenzia delle Entrate (FPR12 — fatture verso aziende/
privati; la Pubblica Amministrazione, formato FPA12, non è coperta qui).
L'invio vero e proprio è un passo separato e successivo: richiede un
account presso un provider che questa sessione non può creare al posto
dell'azienda cliente (dati aziendali veri, spesso un contratto a
pagamento) — vedi "Prossimo passo" più sotto.

**`generate_fatturapa_xml(fattura_id)`** produce l'XML e lo salva sulla
fattura stessa (`sdi_xml`, `sdi_progressivo`, `sdi_generato_at`), insieme
al progressivo di trasmissione univoco (`next_progressivo_invio()`,
stessa garanzia di atomicità di `next_document_number()` — mai un numero
duplicato). Cinque validazioni prima di generare qualunque cosa, ognuna
con un messaggio comprensibile invece di un errore tecnico: partita IVA e
indirizzo completo dell'azienda mittente, partita IVA o codice fiscale
del cliente, e infine un codice destinatario SDI oppure una PEC (con
fallback automatico a `CodiceDestinatario=0000000` + `PECDestinatario`,
lo standard per chi non ha comunicato un codice proprio).

Un dettaglio di correttezza scoperto **durante il collaudo, non
supposto**: le prime versioni controllavano la disponibilità di un
codice destinatario/PEC *dopo* aver già consumato un progressivo di
trasmissione — un tentativo fallito sprecava comunque un numero. Spostato
il controllo prima: un progressivo non viene mai assegnato a una
generazione che poi fallisce.

**Collaudo**, in doppia mandata (locale poi sul progetto reale): XML
ben formato (verificato con il parser XML di Postgres, non solo "sembra
giusto"), struttura e importi esatti su una fattura con due aliquote IVA
diverse, fallback PEC quando manca il codice destinatario, tutte le
validazioni mancanti (partita IVA azienda, indirizzo azienda, cliente
senza PIVA/CF, cliente senza SDI/PEC) con il messaggio giusto, isolamento
tra aziende (una fattura di un'altra azienda risulta "non trovata", mai
visibile), rigenerazione bloccata di default e la conferma che forzarla
consuma davvero un progressivo nuovo — mai lo stesso. Dati di prova
ripuliti dopo ogni collaudo sul progetto reale.

## Fase 2 — completata anche lato fornitore

`web/fornitori.html`, `web/ordini-fornitore.html`, `web/fatture-fornitore.html`:
speculari ai tre moduli cliente principali, sullo stesso `store.js` e con
le stesse garanzie già collaudate (numerazione atomica con prefissi `OF`/
`FTF`, precompilazione righe da un ordine collegato, stato di pagamento
nella stessa forma dati — qui "pagata"/"da pagare" invece di "incassata"/
"da incassare", perché il denaro esce anziché entrare). Non esiste un
"DDT fornitore" in questo schema (come nel gestionale attuale): la
fattura fornitore si collega solo, facoltativamente, a un ordine
fornitore.

Navigazione unificata su tutte e sette le pagine del gestionale (Clienti
· Ordini · DDT · Fatture, poi Fornitori · Ordini forn. · Fatture forn.),
con la voce della pagina corrente sempre evidenziata.

**Non ancora coperto, scelta deliberata**: le note di credito (né lato
cliente né lato fornitore) — le tabelle esistono già dalla Fase 0
(`note_credito`, `note_credito_fornitore`) ma non hanno ancora una pagina
propria. Resta il pezzo più piccolo mancante per la parità con le
collezioni del gestionale attuale.

**Collaudo**: stesso doppio livello delle pagine precedenti — `SaasStore`
simulato in browser reale per ciascuno dei tre nuovi moduli (creazione,
modifica, cancellazione, numerazione con il prefisso giusto,
precompilazione righe da un ordine collegato, toggle "pagata"/"da
pagare" con i valori esatti), più la navigazione verificata coerente su
ogni pagina. Rieseguita l'intera suite precedente (9 file di collaudo in
totale) per la navigazione condivisa aggiornata — tutta verde.

## Prossimo passo

L'unico pezzo mancante per l'invio reale della fatturazione elettronica:
un account presso un provider SDI (Aruba o un altro — l'azienda dovrà
sceglierne e registrarsi da sé), poi una nuova Edge Function (stesso
schema di `ai-proxy`) che prende l'XML già generato e lo trasmette. Poi:
le note di credito (l'unico modulo documento ancora senza pagina), e
Fase 5 (abbonamenti).
