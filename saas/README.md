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
│   ├── dashboard.html                quadro d'insieme: fatturato, incassi, evasione, grafico mensile
│   ├── scadenziario.html             fatture cliente non incassate, ordinate per scadenza
│   ├── report.html                   top prodotti e fatturato per cliente, esportabili in Excel
│   ├── assistente-ai.html            chat sui dati aziendali, tramite l'Edge Function ai-proxy
│   ├── clienti.html                  anagrafica clienti
│   ├── preventivi.html               preventivi, trasformabili in ordine cliente
│   ├── ordini.html                   ordini cliente, con numerazione
│   ├── ddt.html                      DDT, collegato a un ordine (facoltativo)
│   ├── fatture.html                  fatture cliente, con stato di incasso
│   ├── note-credito.html             note di credito cliente
│   ├── incassi.html                  storico incassi (sola lettura)
│   ├── fornitori.html                anagrafica fornitori
│   ├── ordini-fornitore.html         ordini fornitore, con numerazione
│   ├── fatture-fornitore.html        fatture fornitore, con stato di pagamento
│   ├── note-credito-fornitore.html   note di credito fornitore
│   ├── pagamenti.html                storico pagamenti a fornitori (sola lettura)
│   ├── prodotti.html                 catalogo prodotti, con ricerca lato server
│   ├── impostazioni-azienda.html     anagrafica azienda (nome, P.IVA, indirizzo...)
│   ├── abbonamento.html              piano attuale + cambio piano (Fase 5)
│   └── app/
│       ├── store.js                  adattatore di persistenza (sostituisce ghSave/ghLoad)
│       ├── theme.css                 sistema grafico condiviso (token colore, tipografia, componenti)
│       ├── theme-mode.js             tema chiaro/scuro applicato uniformemente (sidebar inclusa)
│       ├── nav.js                    sidebar di navigazione condivisa (sostituisce il menu orizzontale)
│       ├── resize.js                 colonne ridimensionabili trascinando il bordo dell'intestazione
│       ├── print.js                  stampa e PDF di un documento (stesso template dell'originale)
│       └── prodpicker.js             autocompletamento riga da catalogo prodotti
└── supabase/
    ├── functions/
    │   ├── ai-proxy/index.ts             Edge Function: la chiave IA resta lato server (Fase 3)
    │   ├── stripe-checkout/index.ts       Edge Function: avvia un abbonamento (Fase 5)
    │   └── stripe-webhook/index.ts        Edge Function: sincronizza lo stato da Stripe (Fase 5)
    └── migrations/
        ├── 0001_aziende_e_utenti.sql        tabella aziende, utenti↔aziende, ruoli, funzioni di isolamento
        ├── 0002_anagrafiche.sql             clienti, fornitori, prodotti
        ├── 0003_documenti.sql               preventivi, ordini, ddt, fatture, note di credito
        ├── 0004_numerazione.sql             numerazione documenti atomica (OC/OF/DDT/FT/...)
        ├── 0005_registrazione_azienda.sql   registrazione self-service di una nuova azienda (Fase 1)
        ├── 0006_fatturapa.sql               generazione XML FatturaPA (Fase 4, invio non incluso)
        └── 0007_abbonamenti.sql             piani e stato Stripe (Fase 5)
```

## Cosa NON c'è ancora (di proposito)

- **Invio reale allo SDI**: l'XML si genera (Fase 4), ma trasmetterlo richiede un
  account presso un provider esterno che l'azienda dovrà scegliere e attivare da sé.
- **Stripe collaudato solo in sandbox, non in modalità live**: checkout e
  webhook verificati con un abbonamento di prova reale (Fase 5), ma serve
  ripetere prezzi/chiave/webhook in modalità live prima di far pagare un
  cliente vero.
- **Invio email limitato alla modalità sandbox**: `send-email` (invio ordini a
  fornitore, solleciti di pagamento) è distribuita e collaudata con un invio
  reale, ma senza un dominio verificato su Resend può mandare email SOLO
  all'indirizzo del titolare dell'account Resend, non a fornitori/clienti veri
  (vedi sezione dedicata più sotto).

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

**Collaudo**: stesso doppio livello delle pagine precedenti — `SaasStore`
simulato in browser reale per ciascuno dei tre nuovi moduli (creazione,
modifica, cancellazione, numerazione con il prefisso giusto,
precompilazione righe da un ordine collegato, toggle "pagata"/"da
pagare" con i valori esatti), più la navigazione verificata coerente su
ogni pagina.

## Fase 2 — completa: note di credito

`web/note-credito.html` e `web/note-credito-fornitore.html` chiudono la
parità documentale con il gestionale attuale: si collegano
facoltativamente a una fattura (il caso più comune — uno storno parziale
o totale), con la stessa precompilazione righe già vista per DDT/fatture,
oppure esistono da sole. Numerazione atomica con prefissi `NC`/`NCF`.

Navigazione unificata su tutte e nove le pagine del gestionale, in due
gruppi separati da un divisore visivo (Clienti · Ordini · DDT · Fatture ·
NC — poi Fornitori · Ordini forn. · Fatture forn. · NC forn.), voce
corrente sempre evidenziata.

**Collaudo**: menu fattura popolato e filtrato per cliente/fornitore,
precompilazione righe, collegamento facoltativo (una nota di credito
senza fattura funziona lo stesso), numerazione col prefisso giusto,
navigazione coerente su entrambe le pagine. Rieseguita l'intera suite
precedente (10 file di collaudo in totale) — tutta verde, nessuna
regressione dall'aggiunta della navigazione condivisa.

Con questo, tutte le collezioni documento del gestionale attuale hanno
un modulo equivalente nel nuovo prodotto.

## Fase 5 (avvio) — abbonamenti Stripe

Come per Supabase all'inizio, serve un account (qui Stripe) che questa
sessione non può creare al posto dell'azienda — a differenza di Supabase
però, non ne esisteva ancora uno nemmeno in modalità test quando è stato
scritto questo lavoro. Quanto segue è quindi **costruito e verificato per
quanto possibile senza Stripe reale**, con un avviso esplicito su cosa
resta da collaudare quando l'account ci sarà.

`0007_abbonamenti.sql` aggiunge:
- **`plans`**: catalogo pubblico dei piani (trial/base/pro), con
  `stripe_price_id` — vuoto per tutti finché non esistono prezzi Stripe
  veri da collegare.
- **`companies`**: `stripe_customer_id`, `stripe_subscription_id`,
  `subscription_status`, `current_period_end` — scritti solo dal
  webhook, mai dal client. `companies.piano` (già esistente dalla Fase 0)
  resta il campo che il gestionale legge per i limiti effettivi.

Due nuove Edge Function, stesso principio di `ai-proxy` (Fase 3) — la
chiave segreta Stripe non è mai vista dal browser:
- **`stripe-checkout`**: un admin avvia un abbonamento; verifica il
  ruolo, crea (o riusa) il cliente Stripe dell'azienda, crea una sessione
  di pagamento, restituisce l'URL a cui reindirizzare.
- **`stripe-webhook`**: riceve gli eventi Stripe (nessun utente collegato
  qui: l'autenticazione è la firma `Stripe-Signature`, verificata via
  HMAC-SHA256 con Web Crypto — niente SDK Stripe, per restare senza
  dipendenze da bundlare) e tiene `companies.piano` sincronizzato con
  l'abbonamento reale.

`web/abbonamento.html`: mostra il piano attuale e i piani disponibili.
Un difetto reale trovato **durante il collaudo**: la prima versione
confondeva "questo piano non è ancora acquistabile da nessuno" (manca il
prezzo Stripe) con "tu non puoi comprarlo" (serve un admin) nello stesso
generico "Non disponibile" — corretto con tre stati distinti, ciascuno
con il proprio messaggio.

**Collaudato, in tre modi diversi secondo cosa richiedeva Stripe vero**:
1. Migrazione: in locale poi sul progetto reale (piani pubblici
   leggibili, piano di default "trial", vincolo di unicità su
   `stripe_customer_id`).
2. Verifica della firma webhook: la STESSA funzione usata in produzione,
   testata con l'HMAC-SHA256 reale di Node — firma corretta accettata,
   corpo manomesso rifiutato, secret sbagliato rifiutato, timestamp
   vecchio rifiutato (anti-replay) — e poi una richiesta con firma vera
   inviata alla funzione reale già distribuita, accettata correttamente.
3. Autorizzazione di `stripe-checkout` con utenti reali sul progetto:
   nessun token → rifiutato; operatore non-admin → rifiutato con
   messaggio chiaro; admin → passa tutti i controlli fino al piano
   richiesto. `abbonamento.html` collaudata con `SaasStore` simulato.

**Aggiornamento — collaudato con Stripe vero (sandbox)**: account Stripe
collegato (connettore MCP), prezzi Base/Pro creati nella sandbox e
collegati a `plans.stripe_price_id`, `STRIPE_SECRET_KEY` impostata,
endpoint webhook registrato su Stripe con `STRIPE_WEBHOOK_SECRET`
impostata. Checkout reale completato due volte con la carta di test
Stripe (`4242 4242 4242 4242`): la prima volta prima di collegare il
webhook (per verificare che il checkout da solo funzionasse), la
seconda a webhook collegato — `companies.stripe_subscription_id`,
`subscription_status` e `piano` aggiornati correttamente in automatico.

**Bug reale trovato collaudando** (non nella logica scritta "a
memoria" della documentazione, ma confrontando il risultato vero coi
dati attesi): `current_period_end` restava sempre vuoto. Le versioni
recenti dell'API Stripe hanno spostato quel campo dall'oggetto
`subscription` principale dentro ogni riga di `items.data[]` — corretto
in `stripe-webhook/index.ts` leggendo prima il campo legacy e poi,
come fallback, quello nella prima riga (un abbonamento con un solo
prezzo, l'unico caso che questo SaaS crea, ha sempre una sola riga).
Verificato di nuovo aggiornando l'abbonamento di prova: il campo si
popola correttamente. Dati di test ripuliti dalla riga reale di
Ipsofarma dopo il collaudo (non un abbonamento vero, solo l'id/stato
della sandbox).

**Resta da fare solo quando si è pronti a vendere davvero**: ripetere
la stessa procedura (prezzi, chiave, webhook) in modalità **live**
invece che in sandbox — la logica è la stessa, cambiano solo le
credenziali.

## Veste grafica — sistema di design condiviso

Con tutti e nove i moduli documento/anagrafica funzionanti (Fase 2-4) e
Stripe/SDI in attesa di account reali (Fase 5), il passo successivo
scelto è stato rendere il prodotto visivamente professionale — requisito
esplicito per poterlo vendere ad altre aziende, non solo farlo
funzionare.

Prima di questo passaggio ogni pagina aveva un `<style>` inline duplicato
(le stesse regole copiate e leggermente divergenti in dieci file) e una
navigazione orizzontale scritta a mano, diventata via via più difficile
da leggere man mano che i moduli crescevano da 4 a 10 voci.

Due file nuovi in `web/app/`, condivisi da tutte le pagine:

- **`theme.css`**: i token del sistema grafico (colore, spaziatura,
  tipografia — IBM Plex Sans/Mono) definiti una sola volta, con supporto
  automatico alla modalità scura via `prefers-color-scheme` — non un tema
  scelto a mano, ma quello che il sistema operativo dell'utente già
  preferisce. Classi condivise per la struttura (`.app-shell`,
  `.sidebar`, `.app-main`, `.page-head`), le card, le tabelle, i form e i
  pulsanti: ogni pagina le usa, nessuna le ridefinisce.
- **`nav.js`** (`window.SaasNav.render(paginaCorrente, opts)`): la
  sidebar verticale che sostituisce il vecchio menu orizzontale, con le
  voci raggruppate per significato (Clienti, Fornitori, Azienda) invece
  che in un'unica fila crescente. Motivo del cambio: un'unica fila di 11
  voci (compreso "Abbonamento") non si legge più a colpo d'occhio — un
  raggruppamento verticale sì, e si collassa in una barra scorrevole
  sotto gli 860px di larghezza senza bisogno di un menu ad hamburger.

Le **10 pagine del gestionale** (clienti, ordini, ddt, fatture,
note-credito, fornitori, ordini-fornitore, fatture-fornitore,
note-credito-fornitore, abbonamento) sono state riscritte per usare
questo sistema: rimosso ogni `<style>` inline, aggiunta la struttura
`.app-shell`/`.sidebar`/`.app-main`, e la sidebar viene ora popolata da
`SaasNav.render()` invece che scritta a mano in ogni file. **Nessun ID
o comportamento funzionale è cambiato** — solo l'involucro visivo:
tutti i test di collaudo funzionale scritti nelle fasi precedenti
continuano a valere senza modifiche alla logica che verificano, con la
sola eccezione di due dettagli di selettore invalidati proprio dal nuovo
disegno (non da un difetto):
- `test77`/`test79`: la vecchia verifica di navigazione cercava un'
  etichetta di testo univoca (es. "Ordini"); nel nuovo disegno etichette
  come "Ordini" o "Fatture" compaiono di proposito sia nel gruppo Clienti
  sia nel gruppo Fornitori (è il gruppo stesso a disambiguare, non serve
  più abbreviare in "forn."). Corretto verificando per `href` invece che
  per testo.
- `test81`: il titolo del piano dentro ogni card è ora `<h4>` (annidato
  sotto l'`<h3>` "Cambia piano" della card, non più un `<h3>` a sé).

**Collaudo**: rieseguita l'intera suite di collaudo funzionale (10 file,
tutte le pagine) dopo la trasformazione — tutta verde. In più, collaudo
visivo con screenshot (Playwright) di `clienti.html` come pagina pilota:
modalità chiara, modalità scura, form aperto, viewport mobile (420px) —
confermato un aspetto pulito e coerente in tutti e quattro i casi prima
di applicare la stessa trasformazione alle altre nove pagine.

Un difetto reale introdotto (e corretto) durante la trasformazione
automatica: lo script che ha applicato la stessa modifica a otto pagine
in sequenza aveva sostituito `<h2 id="form-title">` con `<h3
id="form-title">` solo nel tag di apertura, lasciando il tag di chiusura
`</h2>` non corrispondente in tutti gli otto file — scoperto rileggendo
i file dopo la trasformazione (non dal collaudo automatico, che in
questo caso non l'avrebbe rilevato), corretto con un secondo passaggio
mirato e verificato un fix per file, non di più e non di meno.

## Veste grafica — allineata al gestionale originale, non più uno stile a sé

La prima versione di `theme.css`/`nav.js` (sezione precedente) era uno stile
nuovo, inventato da zero — chiaro/scuro automatico, sidebar chiara, font
IBM Plex caricato da Google Fonts. Su richiesta esplicita, questa versione lo
sostituisce con **la stessa identità grafica del gestionale Ipsofarma
esistente** (`index.html` nella root del repo): non due prodotti che sembrano
di aziende diverse, ma lo stesso linguaggio visivo, così chi già usa il
gestionale originale si orienta subito nel nuovo prodotto multi-azienda.

Cosa cambia, token per token — copiati (non reinventati) da `index.html`:
- **Sidebar blu scuro** (`#192231`) con voce attiva evidenziata, non più una
  barra chiara — stesso schema del gestionale originale, con la stessa
  icona-più-etichetta per voce (le icone ricalcano quelle già in uso là dove
  il modulo è lo stesso: 🏥 clienti, 🚚 DDT, 🧾 fatture...).
- **Verde accento `#0ea371`** (non più il verde petrolio della prima
  versione), stesso identico colore del pulsante primario, dei link e dei
  numeri di documento nel gestionale originale.
- **Font di sistema** (`system-ui`/-apple-system/Segoe UI/Roboto), non più
  IBM Plex caricato da Google Fonts: stessa scelta del gestionale originale,
  e un effetto collaterale utile — niente più chiamata di rete a
  `fonts.googleapis.com` ad ogni caricamento pagina (fonte, tra l'altro, di
  parte della lentezza/instabilità osservata nei collaudi precedenti).
- **Numeri in monospazio** (`ui-monospace`/SF Mono/JetBrains Mono) su
  P.IVA, importi e totali — stessa convenzione tipografica del gestionale
  originale, non un dettaglio decorativo: rende i numeri allineabili e
  scansionabili a colpo d'occhio in una colonna.
- **Un solo tema** (chiaro): il gestionale originale non ha una modalità
  scura automatica, quindi nemmeno questo la mantiene — replicare "fatto
  come quello" significa anche non aggiungere funzionalità che l'originale
  non ha.
- Pulsanti, tabelle e badge di stato ridisegnati con lo stesso linguaggio
  (bordi sottili, ombra minima, badge con pallino colorato su sfondo
  tenue) invece dello stile "flat" della prima versione.

**Nessun ID o comportamento funzionale è cambiato** — solo colori,
tipografia e la sidebar (rigenerata da `nav.js`, che nessuna pagina scrive a
mano). Anche `index.html` di `saas/web/` (la pagina di accesso, un file a sé
che non usa `theme.css`) è stato riallineato agli stessi colori, per non
avere uno stile diverso solo nella schermata di login.

**Collaudo**: rieseguita l'intera suite di collaudo funzionale (10 file) —
tutta verde, senza toccare un solo test (nessun ID, nessuna struttura DOM
che i test verificano è cambiata). Collaudo visivo con screenshot
(Playwright, viewport desktop 1400px) su `clienti.html` — elenco e form
aperto — a confronto diretto con l'aspetto del gestionale originale.

## Ottimizzazione mobile

Le pagine erano già "responsive" nel senso minimo (la sidebar collassa
sotto 860px), ma non erano ancora davvero comode da usare su un telefono
vero — tre problemi concreti, non ipotetici, corretti in `theme.css` e
nelle 9 pagine con tabelle:

- **Le tabelle più larghe (l'elenco righe di un documento, con 5-6
  colonne) non stavano nello schermo di un telefono.** Prima rompevano il
  layout della pagina intera (tutta la pagina scorreva di lato, sidebar
  compresa); ora ogni tabella vive dentro un proprio contenitore
  `.table-scroll` che scorre orizzontalmente per conto suo — il resto
  della pagina resta fermo. Collaudato non "a occhio" ma misurando
  `scrollWidth`/`clientWidth` del contenitore e verificando che
  `document.body` non scorra mai in orizzontale.
- **Su iPhone, toccare un campo con font-size sotto i 16px fa scattare lo
  zoom automatico di Safari** (pensato per pagine non ottimizzate): sotto
  gli 860px, `input`/`select`/`textarea` passano a 16px apposta per
  evitarlo — un dettaglio invisibile su desktop, fastidioso ogni singola
  volta su un telefono vero.
- **Le aree cliccabili (pulsanti, "Modifica"/"Elimina" nell'elenco) erano
  dimensionate per un mouse**, non per un dito: sotto gli 860px crescono
  di padding, così restano precise da toccare senza dover zoomare.

**Collaudo**: rieseguita l'intera suite di collaudo funzionale (9 file) —
tutta verde, nessuna regressione (i wrapper aggiunti stanno *dentro*
`#list-area` e attorno alla tabella righe, gli ID che i test verificano
non si spostano). In più, verifica visiva dedicata su un viewport 390×844
(taglia iPhone): screenshot dell'elenco clienti, dell'elenco ordini e del
form con due righe di documento aperto, prima e dopo aver toccato un
pulsante dentro la tabella — comportamento nativo del browser confermato
(mettere a fuoco un pulsante dentro un contenitore scorrevole lo scorre
in vista, esattamente come ci si aspetta su un telefono vero).

## Importati i dati reali di Ipsofarma

L'azienda "Ipsofarma" nel nuovo prodotto (creata con i dati anagrafici reali
da `backup.json`: P.IVA, indirizzo, PEC) non parte più vuota: 29 clienti, 7
fornitori, 21.278 prodotti a catalogo, 213 ordini cliente, 283 DDT, 283
fatture cliente, 202 ordini fornitore, 276 fatture fornitore, 2 preventivi,
2+2 note di credito — tutti collegati tra loro esattamente come nei dati
originali (fattura↔DDT, fattura↔ordine, nota di credito↔fattura...), tutti
i codici prodotto e i numeri documento verificati unici prima dell'import.

I contatori di numerazione (`document_counters`) sono stati preimpostati sugli
stessi valori che il gestionale attuale aveva raggiunto: il primo nuovo
ordine/DDT/fattura/nota di credito cliente creato nel nuovo prodotto continua
la numerazione da lì, senza mai ripetere un numero già usato.

**Collaudo**: prima un'analisi completa dei dati sorgente (nessun riferimento
orfano tra clienti/fornitori e documenti, nessun numero duplicato, nessun
codice prodotto duplicato), poi l'intero import eseguito e verificato su un
Postgres locale identico allo schema reale (conteggi, integrità dei
collegamenti, isolamento RLS con un utente estraneo simulato), solo dopo un
collaudo pulito eseguito sul progetto reale uno statement alla volta.
Verificato a campione un documento reale con i suoi collegamenti (una nota
di credito cliente risultava collegata esattamente alla fattura originale).

**Difetto trovato durante l'analisi dei dati reali, non ipotetico**: a
differenza di ordini/DDT/fatture cliente (numerati dal sistema), una fattura
o nota di credito **fornitore** porta il numero che il fornitore stesso le
ha dato (i dati reali importati lo confermano: numeri come `5718067132`, non
`FTF/2026/0001`) — ma `fatture-fornitore.html` e
`note-credito-fornitore.html` generavano comunque un numero automatico.
Corretto: ora il numero si digita, in un campo dedicato, con lo stesso
controllo di duplicato che il database già applicava silenziosamente
(intercettato e trasformato in un messaggio leggibile invece dell'errore
tecnico di Postgres).

## Dashboard — lo stesso quadro d'insieme del gestionale originale

`web/dashboard.html` non è un modulo disegnato da zero: riporta la stessa
logica di `dashboard()`/`buildMonthly()`/`barChart()` del gestionale
originale (`index.html` nella root), la stessa aritmetica (compreso lo
sconto riga, anche a cascata "N+M", che i moduli documento di questo
prodotto non hanno ancora un campo per inserire — vedi sotto), lo stesso
grafico a barre in SVG con tooltip al passaggio del mouse.

Sei riquadri: **totale fatturato** e **totale acquisti** dell'anno
selezionato (IVA inclusa, al netto delle note di credito), **da incassare
dai clienti** e **da pagare ai fornitori** (residuo reale: pagamenti già
registrati e note di credito collegate riducono quanto resta aperto — non
solo "pagata sì/no"), **prodotti da evadere** e **da ricevere dai
fornitori** (sulla quantità residua per riga, `qty - qtyEv`). Sotto, lo
stesso grafico mensile fatturato/acquisti/margine, con un filtro per anno
identico a quello originale.

Aggiunta la voce "Dashboard" in cima alla sidebar (`nav.js`), fuori dai
tre gruppi esistenti — come nel gestionale originale, dove sta sopra
"Clienti"/"Fornitori"/"Azienda", non dentro uno di essi.

**Un limite onesto, scoperto proprio scrivendo questo modulo**: i moduli
ordini/DDT/fatture/note-credito di questo prodotto non hanno ancora un
campo "sconto" nell'editor delle righe (l'originale sì), quindi calcolano
il totale di un documento ignorandolo — sui **dati reali importati**
questo non è ipotetico: 14 fatture cliente e 17 fatture fornitore su
oltre 550 hanno davvero uno sconto riga diverso da zero, e per quei
documenti il totale mostrato nell'elenco della pagina è più alto di
quello vero. La dashboard invece lo calcola correttamente (stessa
aritmetica dell'originale) perché lo sconto, quando presente nei dati
importati, resta comunque dentro il blob `righe` anche se nessuna pagina
lo mostra ancora — quindi i numeri qui sono giusti, ma non ancora coerenti
con quelli che le pagine elenco mostrano per quegli stessi documenti.
Non corretto in questo passaggio (richiede aggiungere il campo sconto a
otto editor di righe, un lavoro a sé), segnalato esplicitamente.

**Collaudo**: nuovo file di test dedicato (11° della suite, ora 10 file
in totale contando anche quelli di navigazione condivisa) — sconto riga
che riduce correttamente il totale, pagamento parziale + nota di credito
che riducono il residuo "da incassare", evasione parziale quantità per
quantità, filtro anno che esclude davvero i documenti fuori periodo,
grafico disegnato con almeno una barra, voce "Dashboard" evidenziata in
sidebar. Rieseguita l'intera suite precedente per il cambiamento
condiviso in `nav.js` — tutta verde, nessuna regressione. Collaudo
visivo con screenshot desktop, dati di prova su più mesi per vedere il
grafico popolato.

## Sconto riga — corretto in tutti i moduli documento

I sei moduli con righe di prezzo (`ordini.html`, `fatture.html`,
`note-credito.html`, `ordini-fornitore.html`, `fatture-fornitore.html`,
`note-credito-fornitore.html` — non `ddt.html`, che non ha mai avuto
prezzi) avevano un campo `sconto` **assente dall'editor**: il totale
calcolato ignorava sempre lo sconto, anche quando il documento (importato
da dati reali, o modificato a mano) lo aveva. Corretto: nuova colonna
"Sconto %" tra Prezzo e IVA %, stessa aritmetica del gestionale originale
— compresa la cascata "N+M" (es. "50+15" = 50% e poi un altro 15% sul
residuo, non 65% secco), già presente nei dati reali importati.

Tre punti di collaudo scelti apposta a coprire i casi che contano
davvero, non solo "il campo esiste": lo sconto digitato riduce il totale
in tempo reale mentre si scrive; selezionare una fattura collegata (in
note-credito.html/fatture-fornitore.html/note-credito-fornitore.html)
porta con sé lo sconto della riga originale, non solo cod/descr/qty/
prezzo/iva come prima; riaprire in modifica un documento con sconto lo
mostra nel campo, non lo perde. La dashboard (sezione precedente) usava
già questa aritmetica corretta — ora i suoi numeri e quelli che ogni
pagina documento mostra nel proprio elenco sono coerenti tra loro, non
più disallineati.

**Collaudo**: nuovo file di test (test83), rieseguita l'intera suite
precedente (11 file) — tutta verde, nessuna regressione. Collaudo visivo
con uno sconto a cascata reale (50%+15% su un prodotto dal catalogo
Aesculap importato).

## Menu su schermi stretti — cassetto verticale, non barra orizzontale

Segnalato dall'utente: su telefono/finestra stretta il menu diventava una
fascia orizzontale scorrevole in cima alla pagina — una scelta fatta
apposta nella prima ottimizzazione mobile di questa sessione, ma diversa
dal gestionale originale, che tiene il menu sempre verticale e lo nasconde
dietro un pulsante ☰ (un "cassetto" che scorre da sinistra, non una
trasformazione del menu stesso).

Corretto per essere identico all'originale: sotto gli 860px il menu resta
verticale esattamente come su desktop, ma esce dal flusso della pagina
(`position:fixed`) e resta nascosto a sinistra dello schermo finché non lo
si apre col pulsante ☰. Navigare a un'altra pagina lo richiude da solo
(pagina nuova, cassetto di nuovo chiuso in partenza) — nessuna differenza
di comportamento da gestire lì.

**Un bug reale trovato durante il collaudo**, non nell'originale: a
cassetto aperto, il pulsante ☰ finiva coperto dal cassetto stesso (stessa
larghezza, stessa posizione a sinistra) — un secondo tocco per richiuderlo
non funzionava più. Il gestionale originale non lo nota perché lì il menu
si chiude sempre navigando (un'app di una sola pagina); qui, con undici
pagine separate, un modo per richiuderlo senza navigare serve davvero.
Corretto tenendo il pulsante sempre sopra al cassetto (`position:sticky`
con uno z-index più alto), cliccabile in ogni momento.

Il pulsante ☰ non è stato aggiunto a mano in undici file HTML: lo crea
`nav.js` una volta sola, appena prima del contenuto di ogni pagina — la
stessa filosofia già usata per il resto della sidebar condivisa.

**Collaudo**: nuovo file di test (test84) — da desktop il pulsante resta
invisibile e il menu è sempre in vista; su schermo stretto il menu parte
fuori vista e il pulsante è visibile; toccandolo il menu scorre in vista
restando verticale (voci impilate, non in fila); toccandolo di nuovo si
richiude; stesso comportamento su una seconda pagina (dashboard) per
verificare che non sia un caso isolato. Rieseguita l'intera suite
precedente (12 file) — tutta verde. Collaudo visivo con screenshot,
cassetto chiuso e aperto.

## Colonne ordinabili — segnalato dall'utente

"Ho notato che le colonne non sono ordinabili se ci clicco": vero, mancava
del tutto — nel gestionale originale ogni intestazione di colonna è
cliccabile (classe `.thsort`, un clic ordina, un secondo clic inverte la
direzione, freccia ↑/↓ e colore d'accento sulla colonna attiva), qui erano
`<th>` statici.

Aggiunto a tutte e nove le pagine con un elenco (clienti, fornitori,
ordini, DDT, fatture, note di credito — sia lato cliente sia fornitore),
non alla tabella delle righe di un documento in fase di compilazione (lì
l'ordine è quello in cui l'utente le inserisce, non ha senso riordinarle).
Colonne di testo (nome, città...), numeriche (totale, importo) e persino
calcolate al volo (il totale di un documento, lo stato pagata/da pagare)
si ordinano tutte con lo stesso meccanismo — non solo un `localeCompare`
su una colonna sola.

**Collaudo**: nuovo file di test (test85) — ordine di default invariato
rispetto a prima (nessuna sorpresa per chi già usa il prodotto), un clic
ordina per la colonna scelta con la freccia e l'evidenziazione giuste, un
secondo clic inverte la direzione, funziona sia su colonne testuali sia
su colonne numeriche/calcolate. Rieseguita l'intera suite precedente (13
file) — tutta verde. Collaudo visivo con screenshot.

## Colonne ridimensionabili — trascinando il bordo dell'intestazione

"Avevamo aggiunto anche che le colonne si potevano ridimensionare": vero
anche questo, e mancava — nel gestionale originale ogni colonna di un
elenco si allarga o si restringe trascinando il bordo destro della sua
intestazione (`makeColsResizable` in `index.html`), con la scelta
ricordata da una visita all'altra. Riportato qui in un file a sé,
`app/resize.js`, applicato agli stessi nove elenchi appena resi
ordinabili — non alla tabella delle righe di un documento in
compilazione, dove ha poco senso ridimensionare mentre si scrive.

La larghezza scelta si ricorda in `localStorage`, ma sotto una chiave
diversa da quella del gestionale originale (`saas_colWidths`, non
`colWidths`): sono due pagine web sullo stesso dominio
(`stefanobozzo82.github.io`), quindi condividono lo stesso localStorage —
usare la stessa chiave avrebbe fatto leggere/scrivere le preferenze
dell'altro prodotto, mescolando due cose che devono restare separate.

**Un bug reale trovato collaudando**, non presente per costruzione: la
prima versione, copiata quasi pari pari dall'originale, impediva il clic
di ordinamento fermando la propagazione del clic sulla sola maniglia —
ma la maniglia segue il puntatore mentre la colonna si restringe (è
ancorata al bordo della colonna, che si sposta ad ogni movimento), quindi
il rilascio del trascinamento cade quasi sempre di nuovo sopra la
maniglia stessa: il clic sintetizzato dal browser dopo un trascinamento
finiva comunque per attivare l'ordinamento della colonna appena
ridimensionata. Verificato con un log degli eventi, non per ipotesi.
Corretto con un meccanismo più robusto: un'intestazione "appena
ridimensionata" viene marcata per un solo clic, e quel clic viene
intercettato in fase di cattura (prima che l'ascoltatore di ordinamento
della pagina, aggiunto in fase di bolla, possa vederlo) — richiede anche
che `resize.js` prenda in carico ogni colonna prima che la pagina
colleghi l'ordinamento, non dopo: un dettaglio d'ordine che, invertito,
faceva ripresentare lo stesso problema.

**Collaudo**: nuovo file di test (test86) — la maniglia compare su ogni
colonna tranne l'ultima, trascinarla restringe davvero la colonna,
*il trascinamento non attiva l'ordinamento* (verificato sia sulla
colonna già ordinata di default sia su una che non lo è — il primo
controllo, ovvio mostra solo la classe "on", si è rivelato insufficiente:
serviva guardare se la freccia cambiava verso), la larghezza scelta
sopravvive a un ricaricamento della pagina, e non tocca la chiave
`colWidths` del gestionale originale. Rieseguita l'intera suite
precedente (14 file) — tutta verde. Collaudo visivo con screenshot.

## Verso la parità col gestionale originale

Chiesto esplicitamente dall'utente: cosa c'era nel gestionale originale che
manca ancora qui? Il confronto (rifatto leggendo `index.html`, non a
memoria) ha prodotto una lista di 15 voci, di cui questa sezione tiene
traccia mano a mano che vengono costruite — un pezzo alla volta, ciascuno
collaudato e pubblicato prima di passare al successivo, con lo stesso
rigore di tutto il resto di questo lavoro.

**Le 15 voci sono ora tutte costruite, collaudate e pubblicate.** Questo
non significa "parità completa e definitiva col gestionale originale" —
diverse voci portano semplificazioni deliberate, annotate voce per voce
qui sotto, che restano possibili giri successivi se e quando serviranno
davvero a un cliente del SaaS. Significa che ogni funzionalità della
lista originale ha oggi un equivalente funzionante in questo prodotto.

- [x] **Prodotti** (`prodotti.html`) — catalogo con ricerca. A differenza
  di clienti/fornitori, NON scarica l'intera collezione (21.278 righe per
  Ipsofarma): `store.searchProdotti()` filtra e limita lato server
  (`.ilike()` su codice/descrizione, tetto di 200 risultati), altrimenti
  ogni apertura della pagina scaricherebbe l'intero catalogo solo per
  mostrarne una schermata. Ricerca con un piccolo ritardo (250ms) per non
  interrogare il database ad ogni battuta.
- [x] **Preventivi** (`preventivi.html`) — speculare a `ordini.html`
  (cliente, righe con sconto, numerazione PREV), con l'aggiunta di
  "Trasforma in ordine": crea un vero ordine cliente con le stesse righe
  (collegato via `prev_id`) e marca il preventivo come convertito
  (`oc_id`), un preventivo già convertito non è più ritrasformabile.
  Un dettaglio di correttezza rispettato di proposito: marcare un
  preventivo come convertito passa sempre l'oggetto completo già in
  memoria, non solo `{id, ocId}` — un salvataggio parziale avrebbe
  svuotato silenziosamente i campi meno comuni (nota, ecc.), che finiscono
  nella colonna `extra` ricalcolata da zero ad ogni `saveDoc()`; verificato
  esplicitamente nel collaudo che la nota sopravviva alla trasformazione.
- [x] **Incassi / Pagamenti** (`incassi.html`/`pagamenti.html`) — sola
  lettura: appiattiscono l'array `pagamenti` già presente su ogni fattura
  cliente/fornitore in un unico elenco cronologico, con due riquadri
  (incassato/pagato nell'anno corrente e in totale). Non si registra un
  incasso/pagamento da qui — resta un'azione di `fatture.html`/
  `fatture-fornitore.html`, come oggi — queste pagine lo mostrano soltanto.
- [x] **Scadenziario** (`scadenziario.html`) — tutte le fatture cliente
  non ancora incassate del tutto, ordinate per data di scadenza (data
  fattura + termini di pagamento del cliente, default 30 giorni — stessa
  formula `dueDate()` dell'originale), con residuo calcolato tenendo conto
  di pagamenti parziali e note di credito. Tre riquadri: scadute, in
  scadenza entro 7 e entro 30 giorni (finestre cumulative, non esclusive
  a vicenda — stessa semantica dell'originale). **Il badge rosso col
  numero di fatture scadute** compare ora sulla voce "Scadenziario" della
  sidebar su **ogni** pagina, non solo su questa: calcolato una volta in
  `nav.js` (una query in più, asincrona e silenziosa — se fallisce la
  sidebar resta comunque utilizzabile, semplicemente senza badge) invece
  di doverlo ricalcolare in ognuna delle altre pagine.
  Semplificato rispetto all'originale, di proposito: un unico elenco
  piatto invece di un raggruppamento per cliente con vista di dettaglio,
  niente ancora esportazione Excel. "Invia sollecito" via email c'è
  (vedi sezione dedicata più sotto).
- [x] **Impostazioni azienda** (`impostazioni-azienda.html`) — modifica
  l'anagrafica dell'azienda (ragione sociale, P.IVA/CF, PEC, codice
  destinatario SDI, indirizzo, telefono/email/sito/IBAN) da interfaccia:
  prima erano dati modificabili solo via SQL diretto (come per l'import
  iniziale). Nuova `store.saveCompany()`. Solo un admin può salvare — la
  RLS lo impone già lato database (vedi `0001_aziende_e_utenti.sql`), qui
  si nasconde in più il pulsante e si disabilitano i campi a chi non lo
  è, per coerenza visiva con `abbonamento.html`, non come unica difesa.
- [x] **Ricerca testuale negli elenchi** — un campo di ricerca (icona a
  lente, come quello di Prodotti) è stato aggiunto sopra ogni elenco di
  anagrafiche e documenti: clienti, fornitori, preventivi, ordini, DDT,
  fatture, note di credito (cliente e fornitore per ognuno). Stessa
  semantica della variabile `Q` del gestionale originale — confronto
  case-insensitive per sottostringa — applicata ai campi visibili in
  tabella: nome/P.IVA/città per le anagrafiche, numero documento e
  ragione sociale della controparte (cliente o fornitore) per i
  documenti. A differenza di Prodotti (che interroga il server, per via
  delle 21.278 righe del catalogo), qui il filtro è lato client sull'
  elenco già caricato: più immediato, dato che i volumi di clienti/
  documenti di una singola azienda sono ordini di grandezza più piccoli.
  Un piccolo ritardo (200ms) evita comunque un nuovo giro di rendering
  ad ogni battuta. Non tocca l'ordinamento né il ridimensionamento delle
  colonne, già presenti: la ricerca filtra le righe prima che vengano
  ordinate e disegnate.
- [x] **Filtri elenco fatture fornitore** (`fatture-fornitore.html`) —
  porta diretta della `.filterbar`/`FFILT` del gestionale originale: filtro
  per fornitore, per stato (pagate/da pagare) e per intervallo di date,
  combinabili tra loro e con la ricerca testuale già presente. Un pulsante
  "✕ Azzera filtri" compare solo quando almeno un filtro è attivo, stessa
  idea dell'originale. Scelto questo elenco per primo perché è quello con
  più righe e più fornitori diversi nel gestionale reale di Ipsofarma —
  gli altri elenchi documento (ordini, DDT, fatture cliente, note di
  credito) restano per ora con la sola ricerca testuale; se servirà
  estendere gli stessi filtri anche lì, la funzione `renderFilterbar()`
  qui è già scritta in modo da poter essere riusata quasi tale e quale.
- [x] **Selezione multipla e azioni collettive** (`fatture.html` e
  `fatture-fornitore.html`) — checkbox per riga più "seleziona tutto" in
  testata, con una `bulkbar` verde scura (stessa idea di quella
  dell'originale) che compare appena c'è almeno una riga selezionata: mostra
  quante e il totale, e propone "✓ Segna incassate/pagate" o "↺ Segna da
  incassare/pagare" a seconda dello stato di quelle selezionate (entrambi i
  pulsanti se la selezione è mista), più "✕ Deseleziona". Limitato di
  proposito a queste due pagine: sono le uniche dove un'azione collettiva
  ha un effetto reale oggi (cambiare stato di incasso/pagamento in blocco);
  l'originale mostra le checkbox anche su ordini/DDT/note di credito perché
  lì l'azione collettiva è scaricare PDF/Excel in blocco — funzionalità non
  ancora costruita qui (vedi "Stampa/PDF di un documento" più sotto). La
  selezione si azzera dopo ogni azione collettiva ed è calcolata solo sulle
  righe attualmente visibili (dopo ricerca e filtri), stessa semantica di
  `filteredDocRows()` nell'originale.
- [x] **Stampa/PDF di un documento** (`app/print.js`, condiviso da tutti
  gli 8 elenchi documento: ordini, DDT, fatture, note di credito, sia
  cliente che fornitore, più preventivi) — due pulsanti per riga, "🖨" e
  "⬇ PDF". "🖨" apre una finestra a sé con lo stesso template e chiama
  subito `window.print()`, senza librerie esterne. "⬇ PDF" genera un file
  scaricabile con jsPDF + html2canvas (caricate da CDN al primo utilizzo,
  non nel bundle) usando **lo stesso identico template HTML** della
  stampa — porta diretta di `buildPrintHTML`/`PA_PRINT_CSS`
  dell'originale, con i nomi di campo del SaaS e i dati azienda letti da
  `companies` invece che da `DB.azienda`. Il caricamento dei dati azienda
  in ogni pagina non blocca il resto se fallisce (try/catch): niente
  stampa/PDF corretti finché non arrivano, ma il resto della pagina resta
  utilizzabile.
  Semplificazioni deliberate rispetto all'originale: niente ancora
  destinazione di consegna multipla nel documento stampato (arriva col
  prossimo punto della lista), niente "stampa in ufficio" via coda
  GitHub/agente Windows (specifico del gestionale di una singola azienda,
  non ha senso per un SaaS multi-tenant con stampanti diverse per ognuna),
  niente scaricamento PDF collettivo per più documenti selezionati insieme
  (la selezione multipla, item precedente, per ora serve solo a
  incassare/pagare in blocco).
- [x] **Destinazioni multiple cliente** (`clienti.html`, `ddt.html`,
  `fatture.html`, `app/print.js`) — porta diretta di `CDEST`/`dest[]`
  dell'originale. In `clienti.html`, il form di modifica ha ora una
  sezione "Destinazioni di consegna": indirizzi aggiuntivi oltre alla sede
  legale (reparti, magazzini, farmacia…), aggiungibili/rimovibili
  liberamente. In `ddt.html` e `fatture.html` (le due collezioni con una
  colonna `dest_id` già in schema) un menu "Destinazione di consegna"
  compare — solo se il cliente scelto ne ha almeno una — per assegnare il
  singolo documento a una sede specifica; l'elenco mostra un sottotitolo
  "📍" sotto il nome del cliente quando è impostata, e la stampa/PDF
  aggiunge un riquadro verde a parte con l'indirizzo di consegna (stessa
  idea di `docDest()` nell'originale). Non estesa a ordini cliente e
  preventivi in questo giro: nel loro caso `dest_id` non è ancora una
  colonna della tabella — richiederebbe una migrazione a sé, lasciata per
  quando servirà davvero (la consegna riguarda soprattutto DDT e fattura,
  i due documenti dove nella pratica conta più spesso).
- [x] **Autocompletamento riga da catalogo prodotti** (`app/prodpicker.js`,
  condiviso da tutti gli 8 elenchi documento: ordini, DDT, fatture, note di
  credito — cliente e fornitore — più preventivi) — porta diretta di
  `prodSearch()`/`prodKeyNav()`/`addProdToOrder()` dell'originale: un
  campo di ricerca sopra l'editor delle righe, con un menu di
  suggerimenti (codice, descrizione, prezzo) navigabile con ↑/↓ e Invio;
  scegliendo un prodotto (clic o Invio) aggiunge una riga precompilata
  (codice, descrizione, prezzo dal listino giusto — vendita lato cliente,
  acquisto lato fornitore — IVA). Su `ddt.html`, che non ha colonne di
  prezzo/sconto/IVA nelle sue righe, precompila solo codice e descrizione.
  Differenza dall'originale: lì la ricerca scorre un array di prodotti
  già in memoria; qui passa da `store.searchProdotti()` (server-side,
  come già fa `prodotti.html`) perché il catalogo può avere ~21.000
  righe — conseguenza pratica, il tasto Invio su un codice digitato per
  intero lo trova "esatto" solo se è già tra i risultati arrivati dal
  server (di solito lo è).
- [x] **Generazione/download XML FatturaPA** (`fatture.html`) — porta
  diretta di `buildFatturaPAXml()`/`downloadFatturaPAXml()` in
  `index.html`: stesso schema XSD (v1.2 dell'Agenzia delle Entrate),
  stessi codici (`RF01` regime fiscale, `TD01` tipo documento, `TP02`
  condizioni di pagamento, `MP05`/`MP12`/`MP01` per bonifico/RiBa/
  contanti). Un pulsante "XML" per riga scarica il file
  `IT{piva}_{numero}.xml`, pronto da caricare su "Fatture e
  Corrispettivi" o inviare via PEC. Se al cliente mancano sia il Codice
  Destinatario che la PEC (obbligatori nell'header di trasmissione), il
  pulsante avvisa invece di generare un file che verrebbe comunque
  scartato dal Sistema di Interscambio.
  Nota onesta: i campi che la fattura elettronica richiede (SDI o PEC,
  indirizzo completo, codice fiscale, termini di pagamento, split IVA…)
  sono già colonne della tabella `clienti` — per i clienti importati dal
  gestionale originale arrivano già popolati, ma `clienti.html` oggi non
  li espone ancora tutti in modifica: un cliente creato da zero nel SaaS
  avrà bisogno di questi dati aggiunti (via SQL diretto, per ora) prima
  di poter generare un XML utilizzabile.
- [x] **Report & Analisi** (`report.html`) — porta diretta di
  `reportView()`: due pannelli, "Top prodotti per fatturato" (dai codici
  ricorrenti su ordini + fatture cliente, i codici "VARIE" non contano —
  sono righe libere senza un prodotto vero) e "Fatturato per cliente"
  (imponibile delle fatture, con percentuale sul totale). Ognuno con un
  pulsante "⬇ Excel" che genera il file con SheetJS, caricata da CDN al
  primo utilizzo — stessa idea di jsPDF in `app/print.js`.
  Semplificato rispetto all'originale, di proposito: niente ancora
  l'export PDF tabellare generico (`bulkExportPDFTable`, per anagrafiche
  senza un "documento" da stampare) né il collegamento diretto dal
  prodotto alla sua scheda — restano per un giro successivo, se servirà
  davvero.
- [x] **Assistente AI** (`assistente-ai.html`) — usa l'Edge Function
  `ai-proxy` costruita in Fase 3 (il browser non vede mai la chiave
  Gemini). Nuova `store.aiComplete()`, stesso schema di
  `store.startCheckout()`: passa sempre dal server, mai una chiamata
  diretta al provider. Diversa di proposito dall'assistente
  dell'originale (`aiView()`): lì è un'unica istruzione che l'IA traduce
  in un **piano di azioni** (crea/modifica documenti) con anteprima prima
  di applicarlo; qui è una **conversazione vera, sola lettura** — risponde
  a domande sui dati aziendali (chi deve pagare/incassare cosa, fatturato
  del mese, ordini aperti) usando un riepilogo calcolato al volo ad ogni
  domanda (residui per cliente/fornitore, fatturato/acquisti del mese
  corrente), passato come messaggio di sistema insieme a un'istruzione
  esplicita di non inventare cifre. La cronologia della conversazione
  viaggia col messaggio successivo (fino alle ultime 20 battute, poi
  viene tagliata) — non un singolo giro come nell'originale.
  La parte "piano di azioni" (creare/modificare un documento da
  un'istruzione o da un allegato) resta per il prossimo — e più grande —
  pezzo della lista.
- [x] **IA che crea documenti da un allegato** (`fatture-fornitore.html`)
  — porta di `pdfExtractSupplierInvoice()`/`openXmlImport()`
  dell'originale, semplificata: un pulsante "📎 Importa da PDF/foto (AI)"
  legge un allegato (PDF o foto di una fattura fornitore) e precompila il
  form "Nuova fattura" già esistente — fornitore (cercato per nome tra
  quelli già registrati), numero, data, righe — pronto da controllare e
  salvare con la stessa validazione di sempre (compreso il controllo di
  numero duplicato). Un PDF non è leggibile come tale da un modello di
  chat: le pagine vengono prima trasformate in immagini (pdf.js, da CDN,
  come `jsPDF`/`SheetJS` altrove), poi inviate come messaggio multimodale
  a `store.aiComplete()` — stessa `ai-proxy` di Fase 3, la chiave resta
  sul server. Se il fornitore letto non corrisponde a nessuno già
  registrato, il form si precompila comunque (numero/data/righe) con un
  avviso esplicito, invece di bloccare l'importazione.
  Semplificato rispetto all'originale, di proposito — è la voce più
  grande della lista, lasciata per ultima: niente ancora lettura diretta
  di XML/P7M della fattura elettronica (percorso deterministico separato,
  qui si passa sempre dall'AI), niente confronto riga per riga con
  l'ordine fornitore collegato né importazione multipla in un colpo solo,
  niente estrazione per ordini/preventivi (l'originale stesso ha questo
  percorso solo per le fatture fornitore).

Non nella lista di proposito — non è "gestionale mancante", è
un'integrazione specifica del modo di lavorare di Ipsofarma da ripensare,
non semplicemente copiare, se e quando servirà a un cliente del SaaS:
l'import automatico ordini da Google Sheet e il monitoraggio Gmail per
nuove fatture fornitore.

## Tema chiaro/scuro

Segnalato dall'utente dopo aver usato il prodotto con dati reali: la
sidebar restava sempre blu scuro fissa, qualunque fosse il resto della
pagina — incoerente col tema chiaro di sempre. Chiesto esplicitamente:
poter scegliere tra un tema chiaro e uno scuro da Impostazioni, e che la
scelta cambi *tutto* in modo uniforme, sidebar inclusa.

`app/theme.css` ridefinisce ora l'intero set di variabili colore sotto
`:root[data-theme="dark"]` (sidebar, sfondi, bordi, testo, badge, tutto):
siccome il resto del foglio di stile usa già solo quelle variabili — mai
un colore fisso, a parte i pochi casi dove ha senso restare fissi (testo
bianco su un pulsante verde, il tooltip del grafico, il template di
stampa/PDF che deve restare "carta bianca" comunque) — il tema si applica
automaticamente ovunque, senza dover toccare ogni componente uno per uno.
Nuovo `app/theme-mode.js`: `SaasTheme.get()/set()`, preferenza salvata in
`localStorage` (per dispositivo/browser, non per azienda — due persone
della stessa azienda possono scegliere temi diversi). Un piccolo script
inline in testa a ogni pagina (prima del foglio di stile) applica subito
il tema salvato, per evitare un lampo del tema sbagliato al caricamento.

Il selettore vive in una nuova sezione "Aspetto" di
`impostazioni-azienda.html`, fuori dal form dell'anagrafica azienda
apposta: è una preferenza personale, visibile e modificabile da chiunque
(admin o operatore), non un dato dell'azienda che solo un admin può
cambiare.

Unica eccezione che ha richiesto codice a sé: il grafico a barre della
dashboard è un SVG disegnato a mano (`dashboard.html`), i cui colori sono
scritti nell'HTML al momento del disegno — non ereditano le variabili CSS
come farebbe un elemento normale. Le linee guida e le etichette degli
assi ora leggono `--chart-grid`/`--chart-axis`/`--chart-label` con
`getComputedStyle()` ad ogni disegno, e il grafico si ridisegna quando il
tema cambia (evento `saas-theme-change`). I colori delle tre serie
(fatturato/acquisti/margine) restano fissi in entrambi i temi — sono già
abbastanza saturi da leggersi bene su sfondo sia chiaro che scuro, e
cambiarli avrebbe rotto la fedeltà col grafico del gestionale originale
senza un vero bisogno.

## "Da incassare"/"Da pagare" sbagliati — risolto

Segnalato dall'utente confrontando la dashboard con il gestionale
originale: "Da incassare dai clienti" e "Da pagare ai fornitori" non
tornavano. Verificato ricalcolando entrambe le cifre direttamente da
`backup.json` (i dati reali e aggiornati del gestionale originale, che
l'utente continua a usare in parallelo — i suoi salvataggi automatici si
vedono nella cronologia Git) con la stessa identica aritmetica di
`payState()` in `index.html`: **189.421,17 €** da incassare, **91.175,76
€** da pagare — la prima cifra è esattamente quella segnalata
dall'utente. Dopo tutte le correzioni sotto, la dashboard mostra
esattamente questi due importi.

Tre cause distinte, trovate confrontando riga per riga il codice e i dati
con l'originale (con accesso in lettura/scrittura a Supabase fornito
dall'utente per questa sola operazione):

1. **Bug di codice, il più grande di tutti**: le tabelle Supabase hanno
   `pagamenti jsonb not null default '[]'` — quindi per qualunque fattura
   importata dal vecchio gestionale (dove il campo "pagamenti" con lo
   storico degli incassi parziali semplicemente non esiste) arriva sempre
   un **array vuoto**, mai `null`/assente come nel gestionale originale.
   `payTot()`, portato pari pari dall'originale, controllava
   `it.pagamenti == null`: con un array vuoto (mai `null`) quel controllo
   non scattava **mai**, quindi il flag "paid" veniva ignorato per
   qualunque fattura senza incassi parziali tracciati — ribaltando "Da
   incassare"/"Da pagare" su decine di migliaia di euro (155 fatture
   cliente e 185 fatture fornitore segnate "paid" ma con questo problema).
   Corretto trattando un array vuoto come l'assenza del campo, in
   `dashboard.html`, `scadenziario.html` e `assistente-ai.html`.
   Collaudato con un nuovo `test105_pagamenti_array_vuoto.py`.
2. **`ncCreditoFor()` a parti uguali invece che a cascata** — bug
   descritto ed corretto in una sessione precedente (vedi git log),
   confermato ancora corretto qui.
3. **Dati non allineati, minori**: 2 fatture fornitore create nel
   gestionale originale dopo l'import iniziale non erano mai arrivate su
   Supabase (inserite ora, recuperando i riferimenti a fornitore/ordine
   per numero); e le 2 note di credito con importo imputato a una fattura
   specifica (`ftId`/`ftfId`) avevano perso quel riferimento nell'import
   iniziale — la colonna FK risolta (`fattura_id`) c'era, ma il campo
   `ftId`/`ftfId` letto dalla logica finanziaria portata dall'originale
   (che lavora per numero documento, non per id Supabase) mancava
   nell'`extra` jsonb. Corretto reintegrando i due campi con lo
   stesso valore di `backup.json`.

Il token Supabase fornito dall'utente per l'operazione è stato usato solo
per questa sessione (letture + le scritture sopra elencate, tutte
puntuali e non distruttive) e non è mai stato scritto in nessun file del
repository.

## Autocompletamento anche dentro il campo "Codice" di ogni riga

Richiesto dall'utente: finora l'autocompletamento da catalogo
(`prodpicker.js`) viveva solo nella barra di ricerca separata sopra la
tabella delle righe — scrivere direttamente nel campo "Codice" di una riga
già presente (o di una riga vuota aggiunta con "+ aggiungi riga") non
suggeriva nulla, un limite che c'è anche nell'originale (`addProdToOrder()`
in `index.html` aggiunge sempre una riga nuova, non ne compila mai una
esistente). Aggiunto in tutti gli 8 moduli documento (`ordini.html`,
`ddt.html`, `fatture.html`, `preventivi.html`, `note-credito.html`,
`ordini-fornitore.html`, `fatture-fornitore.html`,
`note-credito-fornitore.html`): lo stesso menu di suggerimenti della barra
di ricerca, ma dentro il campo stesso — scegliendo un prodotto riempie
codice/descrizione/prezzo/IVA di quella riga (non ne aggiunge una nuova,
non tocca le altre). `prodpicker.js` ha un nuovo `opts.clearOnPick:false`
per questo caso: la barra di ricerca separata continua a svuotarsi dopo
la scelta (aggiunge sempre una riga nuova), il campo "Codice" di una riga
invece resta con il codice scelto (è lui il campo che si salva). Collaudato
con un nuovo `test106_autocomplete_riga.py`.

## "Importa da PDF (AI)" restituiva sempre un errore — risolto e distribuito

Segnalato dall'utente: prova a importare una fattura in PDF, l'AI
restituisce un errore. Causa trovata leggendo il codice delle due Edge
Function chiamate direttamente dal browser (`ai-proxy`,
`stripe-checkout`): **nessuna delle due gestiva il preflight CORS**. Un
`fetch()` da `https://stefanobozzo82.github.io` verso
`https://rixvgmzedwdzgavjewbm.supabase.co/functions/v1/...` con
`Content-Type: application/json` e un header `Authorization`
personalizzato non è una "simple request": il browser manda prima una
richiesta `OPTIONS` di controllo, e solo se la risposta ha gli header
CORS giusti procede con la vera chiamata POST. Qui l'unico controllo era
"se non è POST, 405" — l'`OPTIONS` ci finiva dentro, il browser bloccava
tutto **prima ancora che la richiesta arrivasse al server**, e il codice
la vedeva come un generico errore di rete.

Perché non l'ha preso nessun test: i test Playwright di questo progetto
sostituiscono sempre `window.SaasStore` con un mock (per non dipendere da
una vera sessione/rete durante il collaudo) — `store.aiComplete()` e
`store.startCheckout()` non vengono mai davvero chiamati nei test, quindi
un bug che esiste solo "quando il browser chiama per davvero la Edge
Function" non aveva modo di emergere lì. Serviva un utente vero che
premesse il pulsante contro Supabase reale.

Corretto in `ai-proxy/index.ts` e `stripe-checkout/index.ts`: header CORS
su ogni risposta, `OPTIONS` gestito esplicitamente prima del controllo
"solo POST". Distribuito su Supabase con un Personal Access Token della
Management API fornito dall'utente per questa sola operazione
(`supabase functions deploy ai-proxy` / `stripe-checkout --use-api`),
usato solo per il deploy e non salvato in nessun file del repository.
Verificato con una vera richiesta `OPTIONS` contro l'endpoint in
produzione: risponde `204` con gli header CORS corretti (prima di questo
fix non rispondeva affatto — `405`, bloccato dal browser prima ancora di
arrivare qui).

## Colonne Imponibile e IVA negli elenchi documento

Richiesto dall'utente: nel gestionale originale ogni elenco documento
mostra Imponibile e IVA come colonne a sé (non solo il Totale, che le
somma già insieme). Aggiunte a tutti gli elenchi con righe prezzate:
`ordini.html`, `fatture.html`, `preventivi.html`, `note-credito.html`,
`ordini-fornitore.html`, `fatture-fornitore.html`,
`note-credito-fornitore.html` — ordinabili come le altre colonne.
`ddt.html` escluso di proposito: le sue righe non hanno mai avuto
prezzo/sconto/IVA in questo prodotto (un DDT è solo quantità, non un
documento prezzato — coerente con come li tratta anche l'originale in
stampa), quindi non c'è nulla da mostrare finché quei campi non vengono
aggiunti anche lì: un lavoro a sé, più ampio di una semplice colonna in
più, non fatto qui.

## Azioni per riga visibili solo con la spunta

Richiesto dall'utente: i pulsanti di una riga (stampa, PDF, XML, modifica,
elimina) prima erano sempre visibili in ogni riga dell'elenco — ora
compaiono solo quando quella riga è selezionata con la spunta. `fatture.html`
e `fatture-fornitore.html` avevano già la spunta (per le azioni collettive:
segna incassate/pagate); qui è bastato nascondere il contenuto della cella
`azioni` quando la riga non è selezionata. Gli altri 6 moduli
(`ordini.html`, `ddt.html`, `preventivi.html`, `note-credito.html`,
`ordini-fornitore.html`, `note-credito-fornitore.html`) non avevano alcuna
spunta: aggiunta una colonna con spunta singola + "seleziona tutti"
nell'intestazione, sullo stesso modello già usato in fatture.html (un
`Set` di id selezionati, ri-renderizzato a ogni clic).

Il clic sulla riga per aprire il documento resta invariato (funziona
comunque, spuntata o no); solo i pulsanti azione dipendono dalla spunta.
Aggiornati 9 test esistenti che cliccavano i pulsanti senza passare dalla
spunta (ora selezionano la riga prima), più un nuovo
`test107_azioni_con_spunta.py` dedicato. Regressione completa (37 file)
passata.

## Lotto e scadenza mancanti nell'editor righe — bug reale di perdita dati

Segnalato dall'utente: aprendo una fattura non si vedono lotto e
scadenza per riga. Verificato contro l'originale: lì questi due campi
compaiono nell'editor righe SOLO per `ddt`, fatture cliente, fatture
fornitore, note credito e note credito fornitore (flag `LOTE` —
`ordiniCliente`/`ordiniFornitore`/`preventivi` non li mostrano mai, ha
senso: non c'è ancora un lotto fisico da tracciare prima che la merce si
muova davvero). In questo prodotto quei due campi non sono **mai esistiti**
in nessun modulo, da quando è stato costruito.

Non è solo un campo mancante da vedere: `readRighe()` ricostruisce ogni
riga da zero leggendo solo gli input effettivamente presenti nel form —
quindi qualunque riga con `lotto`/`scad` già valorizzati (es. una fattura
fornitore creata con l'importazione AI, che li estrae) li **perdeva
silenziosamente** al primo salvataggio, anche senza toccare nulla.

Aggiunti i campi (testo per il lotto, data per la scadenza) a
`rigaRowHtml()`/`readRighe()`/intestazione tabella in `ddt.html`,
`fatture.html`, `fatture-fornitore.html`, `note-credito.html`,
`note-credito-fornitore.html` — stessa identica selezione di moduli
dell'originale. Estesa anche l'importazione AI di `fatture-fornitore.html`
per estrarre lotto/scadenza dal PDF (mancava anche lì: il prompt non lo
chiedeva). `print.js` già li mostrava correttamente quando presenti — non
c'era niente da correggere lì. Collaudato con un nuovo
`test108_lotto_scadenza.py` (apertura con dati già valorizzati, salvataggio
senza perdita, e verifica che ordini.html non li mostri, come
nell'originale). Regressione completa (38 file) passata.

## L'elenco si nasconde quando un documento è aperto

Richiesto dall'utente: prima, aprendo un documento (nuovo o esistente),
il form comparivano SOPRA l'elenco di tutti i documenti — che restava
lì, sempre visibile, sotto. Ora l'elenco si nasconde quando il form è
aperto, e al suo posto (in cima al form) c'è un pulsante "← Torna
all'elenco" per farlo ricomparire. Il pulsante "Annulla" già esistente in
fondo al form fa la stessa cosa (nessuna modifica al suo comportamento,
solo in più nasconde/mostra l'elenco).

Applicato a tutti gli 8 moduli documento: la card dell'elenco ha ora un
`id="list-card"`, `openForm()` la nasconde, `closeForm()` la fa
ricomparire — la stessa funzione già richiamata da "Annulla", dal nuovo
pulsante "Indietro" e dopo un salvataggio riuscito. Collaudato con un
nuovo `test109_elenco_nascosto_in_apertura.py`. Regressione completa (39
file) passata.

## Clienti e fornitori: righe cliccabili e anagrafica completa

Richiesto dall'utente: rendere clienti.html/fornitori.html cliccabili
come gli altri moduli (clic sulla riga apre il form, l'elenco si nasconde
con il pulsante "← Torna all'elenco"), e aggiungere i campi tipici dei
gestionali più diffusi. Prima di scrivere codice ho controllato lo schema
Supabase (`0002_anagrafiche.sql`) e `store.js`: **i campi c'erano già**
— `cf`, `sdi`, `pec`, `split` (scissione pagamenti), `esig` (esigibilità
IVA), `via`/`cap`/`prov` (solo la città era esposta), `pag`/`term`
(modalità e termini di pagamento), `iban`, `ref` (referente) per i
clienti; gli stessi meno `sdi`/`split`/`esig` per i fornitori (scelta
già presente nello schema: quei tre concetti riguardano solo la
fatturazione attiva verso i clienti, non ha senso averli su un
fornitore). Il form semplicemente non li esponeva mai — nessuna
migrazione richiesta, tutto risolvibile lato pagina.

Aggiunti in entrambi i form, con la stessa struttura a sezioni
dell'originale (Anagrafica → Fatturazione elettronica → Sede legale →
Pagamento → Contatti). Collaudato con un nuovo
`test110_clienti_fornitori_campi.py`. Regressione completa (40 file)
passata.

## Filtri di ricerca in tutti i moduli documento

Richiesto dall'utente: `fatture-fornitore.html` aveva già una filterbar
(fornitore/stato/intervallo date, task #7 di questa lista) — estesa a
tutti gli altri 7 moduli documento, stesso pattern (`FFILT`,
`matchesFilter()`, `renderFilterbar()`, pulsante "✕ Azzera filtri" quando
almeno un filtro è attivo): `ordini.html`, `ordini-fornitore.html`,
`ddt.html`, `note-credito.html`, `note-credito-fornitore.html` (cliente/
fornitore + intervallo date — nessuno stato: questo port non traccia
ancora evasione/fatturazione DDT), `fatture.html` (cliente + stato
incasso + date, mirror esatto dell'esistente su fatture fornitore),
`preventivi.html` (cliente + stato convertito/aperto, basato su `ocId` —
l'unico stato realmente tracciato per i preventivi).

Filtri e ricerca testuale (`Q`) si combinano (`.filter(matchesQuery)
.filter(matchesFilter)`). Collaudato con un nuovo
`test111_filtri_moduli.py`. Regressione completa (41 file) passata.

## Limiti del piano applicati per davvero (blocca + avvisa)

I limiti dei piani (`plans.limite_documenti_mese`) esistevano solo come
testo nelle card di Impostazioni → Abbonamento: nessun codice li
controllava mai prima di creare un documento. Richiesto dall'utente:
"bloccare e avvisare". Aggiunto `store.checkDocLimit(companyId)`
(`app/store.js`) — legge `companies.piano`, il limite di quel piano su
`plans`, conta quanti documenti l'azienda ha creato questo mese sulle 8
tabelle documento (`created_at` nel mese corrente), e dice se il limite è
già raggiunto. `null` = piano senza limite (oggi "Base" e "Pro"): non
blocca mai.

Agganciato in tutti gli 8 moduli documento in due punti: sul pulsante "+
Nuovo ..." (blocca PRIMA di aprire il form, con un avviso che spiega il
limite e rimanda a Impostazioni → Abbonamento — niente di peggio che
compilare un intero documento per poi scoprire di non poterlo salvare),
e di nuovo al salvataggio come rete di sicurezza (nel caso il limite
venga raggiunto nel frattempo, es. da un'altra scheda). **Solo la
creazione è limitata**: modificare un documento già esistente non
controlla mai il limite.

**Resta un limite non applicabile**: `plans.limite_utenti` non ha nessun
posto dove agganciarsi — questo prodotto non ha ancora nessun flusso per
invitare un collega in azienda (solo chi si registra da sé diventa
membro). Va costruito quel flusso prima di poterne limitare il numero.

Nuovo `test112_limite_piano.py`. Estendere `store.checkDocLimit()` ha
richiesto aggiungere un finto `checkDocLimit` a 38 mock di test esistenti
(qualunque pagina che apre un "+ Nuovo ..." lo chiama ora davvero).
Regressione completa (42 file) passata.

## Inviti in azienda — chiude il limite utenti rimasto aperto

Richiesto dall'utente ("costruiscilo"): mancava qualunque modo per un
admin di far entrare un collega nella PROPRIA azienda — l'unico ingresso
possibile era registrarsene una nuova. Senza questo, il limite
`plans.limite_utenti` non aveva nessun posto dove applicarsi.

Nuova migrazione `0008_inviti.sql`, stesso principio di
`register_company` (Fase 1): un utente che non è ancora membro non può
scrivere `memberships` da solo, quindi l'unico varco sono funzioni
server-side dedicate (`security definer`), mai un insert diretto del
client.

- `create_invite(company_id, email, role)` — solo un admin, verifica che
  la persona non sia già in azienda e che non ci sia già un invito in
  sospeso per quell'indirizzo, **applica qui il limite utenti del
  piano** (membri attuali + inviti in sospeso confrontati con
  `plans.limite_utenti`; `null` = nessun limite).
- `invite_preview(token)` — dati minimi non sensibili (nome azienda,
  email, ruolo) leggibili anche da chi non è ancora autenticato, per
  mostrare "sei stato invitato da X" prima del login.
- `accept_invite(token)` — richiede una sessione attiva (account nuovo o
  già esistente, stesso percorso per entrambi) e che l'email
  dell'account corrisponda a quella dell'invito; crea la membership e
  segna l'invito accettato.
- `list_members(company_id)` — chi c'è già, con l'email (`memberships`
  non la contiene: vive in `auth.users`, non leggibile direttamente dal
  client).

**Niente invio email automatico** (servirebbe un provider email
configurato, non ancora fatto): l'admin genera il link da Impostazioni →
Team e lo manda lui stesso (copiato negli appunti in automatico).

Lato pagine: `index.html` mostra il banner "sei stato invitato" quando
si apre con `?invite=<token>`, precompila e blocca l'email, e accetta
l'invito in automatico appena c'è una sessione (dopo login o dopo
registrazione). `impostazioni-azienda.html` ha una nuova card "Team":
elenco membri con cambio ruolo/rimozione (solo admin), form di invito,
elenco inviti in sospeso con "copia link"/revoca. Un operatore/viewer
vede il team ma non tocca ruoli né invita.

Nuovo `test113_inviti.py`. Regressione completa (43 file) passata.
**Migrazione distribuita**: applicata su Supabase (progetto reale) via
Management API — tabella `invites` e le 4 funzioni (`create_invite`,
`invite_preview`, `accept_invite`, `list_members`) verificate presenti
e funzionanti. Il flusso è operativo end-to-end.

## Invio email — ordini a fornitore e solleciti di pagamento

Richiesto dall'utente: nel gestionale originale esistevano "invia ordine
per email" (da `ordini-fornitore.html`) e "invia sollecito" per le
fatture cliente scadute (dallo Scadenziario), entrambi passando da uno
script Google Apps Script il cui URL è salvato per-azienda in
Impostazioni. Un espediente ragionevole per un gestionale a singolo
tenant, ma scomodo da chiedere a un cliente del SaaS (dovrebbe crearsi e
collegare un proprio script Google) — non era mai stato portato qui, di
proposito, per lo stesso motivo già scritto per l'import Google Sheet e
il monitoraggio Gmail.

Costruito invece con lo stesso principio di `ai-proxy`/`stripe-checkout`
(Fase 3/5): una nuova Edge Function `send-email` condivisa da tutte le
aziende del SaaS, dove la chiave del provider (**Resend**) vive SOLO
come secret del server — il browser non la vede mai — e ogni chiamata
richiede una sessione utente autenticata appartenente ad almeno
un'azienda (stessa verifica di `ai-proxy`). `store.sendEmail(payload)`
è il nuovo punto di passaggio lato client.

- `ordini-fornitore.html` — pulsante "✉ Email" per riga (visibile solo
  con la spunta, come le altre azioni), apre una card dedicata
  precompilata (destinatario = email fornitore, oggetto, messaggio
  modificabile), genera il PDF dell'ordine con `SaasPrint.pdfBase64()`
  (stesso template di stampa, fattorizzato da `downloadPDF()`) e lo
  allega. L'invio riuscito è tracciato in `extra.emailSent` (colonna
  già esistente, `ordiniFornitore` ha `hasExtra:true` — nessuna nuova
  migrazione necessaria).
- `scadenziario.html` — pulsante "✉ Sollecito" compare solo sulle righe
  scadute; un clic raccoglie TUTTE le fatture scadute dello stesso
  cliente (non solo quella riga, come `openSollecito()`
  nell'originale) in un'unica email con tabella riepilogativa nel
  corpo — niente PDF allegato, stesso comportamento dell'originale.

**Distribuita e collaudata**: account Resend creato, `RESEND_API_KEY`
impostata come secret del progetto Supabase, funzione distribuita
(`supabase functions deploy send-email --use-api`), preflight CORS e
rifiuto delle chiamate senza sessione verificati. Invio reale
collaudato tramite l'API Resend (stesso payload che produce
`send-email`): consegna confermata, `id` di ritorno
`7f6cad30-9e93-42eb-8b75-622e0b914391`.

**Limite temporaneo della modalità sandbox** (nessun dominio ancora
verificato su Resend): le email partono dall'indirizzo sandbox
(`onboarding@resend.dev`) e Resend le accetta **solo** se il
destinatario è l'indirizzo con cui è stato creato l'account Resend
stesso — verso qualunque altro destinatario (un fornitore o cliente
vero) la chiamata viene rifiutata con 403. Per usarlo in produzione
verso indirizzi reali serve verificare un dominio proprio su Resend
(pannello Resend → Domains, un record DNS) e impostare `RESEND_FROM`
su un indirizzo di quel dominio — unico passo ancora da fare.

Nuovo `test114_invio_email.py` (come `test95_stampa_pdf.py`, non
esercita il vero jsPDF/CDN: `window.SaasPrint.pdfBase64` viene
sostituito con una spia). Regressione completa (44 file) passata.

### Mittente per azienda cliente — necessario prima di vendere il SaaS a terzi

Domanda dell'utente: con un solo `RESEND_API_KEY`/`RESEND_FROM` condivisi
da TUTTO il SaaS, un secondo cliente (non Ipsofarma) manderebbe email
comunque "a nome" del primo — non accettabile appena c'è più di
un'azienda cliente.

Soluzione scelta (la stessa che usa la maggior parte dei gestionali in
cloud, non uno degli altri due possibili approcci — un dominio Resend
per azienda o l'account email personale del cliente via OAuth — perché
entrambi richiederebbero a ogni farmacia cliente lavoro tecnico che non
sa fare): **un mittente unico di piattaforma, con nome mostrato e
"Rispondi a" personalizzati sull'azienda che scrive**. `send-email`
accetta ora `fromName` (nome dell'azienda) e `replyTo` (la sua email,
da `companies.settings.email`): il destinatario vede "Farmacia Rossi
(tramite `PLATFORM_NAME`) `<mittente-piattaforma>`" come mittente, e se
risponde la mail arriva davvero alla farmacia, non alla piattaforma.
`PLATFORM_NAME` è un secret a sé (non "Ipsofarma": quella è solo la
prima azienda cliente, non il nome del prodotto — vedi la sezione sul
nome più sotto) così cambia in un punto solo quando si sceglie un nome
definitivo. Nessuna configurazione richiesta ai clienti: funziona per
chiunque si iscriva, senza che debbano creare un account Resend o
verificare un dominio proprio.

`ordini-fornitore.html`/`scadenziario.html` passano già `fromName:
company.nome, replyTo: company.settings.email` a ogni chiamata di
`store.sendEmail()`. Un'azienda che ha già un proprio dominio potrà in
futuro verificarlo separatamente su Resend (un account Resend può avere
più domini) e passare a un from dedicato per lei sola — non ancora
costruito, perché nessun cliente reale lo ha ancora chiesto.

`test114_invio_email.py` esteso per verificare `fromName`/`replyTo` nel
payload (compreso il caso senza `settings.email`: `replyTo` resta
assente invece di rompere l'invio). Regressione completa (44 file)
passata. Funzione ridistribuita.

## Solleciti automatici — non serve più aprire Scadenziario ogni volta

Dal confronto con Fatture in Cloud (che li ha nei piani alti): manda da
solo un promemoria di pagamento ai clienti con fatture scadute da
almeno N giorni, invece di richiedere il clic manuale su "Invia
sollecito" ogni volta.

Nuova Edge Function `solleciti-automatici`, strutturalmente diversa
dalle altre (`ai-proxy`/`send-email`/`stripe-checkout`): non la chiama
un utente loggato per la propria azienda, la chiama un job schedulato
una volta al giorno per TUTTE le aziende che hanno attivato l'opzione —
quindi usa `SUPABASE_SERVICE_ROLE_KEY` (bypassa la RLS) invece della
sessione del chiamante, ed è protetta da un segreto a sé
(`CRON_SECRET`, header `X-Cron-Secret`) invece che da un controllo di
sessione.

- Aritmetica (`payTot`/`ncCreditoFor`/`payState`/`dueDate`) portata 1:1
  da `scadenziario.html` — verificata a parte con uno script Node
  prima di scrivere il Deno (10 casi limite, tutti passati), visto che
  in questo ambiente non è disponibile un runtime Deno per un test
  diretto.
- Ogni fattura riceve **al massimo un sollecito automatico**: appena
  inviato si segna `extra.sollecitoAutoInviato` (colonna `extra` già
  esistente su `fatture_cliente` — nessuna migrazione) e non viene più
  riconsiderata. Il sollecito manuale da Scadenziario resta comunque
  disponibile in ogni momento, i due percorsi non si escludono.
- Supporta `{"dryRun": true}`: calcola tutto senza mandare email né
  scrivere `extra` — usato per collaudare contro dati veri senza
  rischiare di disturbare clienti reali.
- Nuovi campi in Impostazioni azienda (`impostazioni-azienda.html`):
  interruttore "Attiva i solleciti automatici" e "Giorni di ritardo
  prima dell'invio" (default 7), dentro `companies.settings` — **spento
  di proposito per tutte le aziende, Ipsofarma compresa**, finché non
  lo si attiva esplicitamente. Attivarlo senza un'email azienda
  compilata (serve per "Rispondi a") blocca il salvataggio con un
  messaggio chiaro invece di fallire in silenzio.

**Distribuita, collaudata e programmata**: `CRON_SECRET` impostato come
secret, funzione distribuita, verificato che rifiuta le chiamate senza
il segreto giusto (401) e che un `dryRun` contro il progetto reale
risponde correttamente (`companiesChecked: 0`, coerente: nessuna
azienda ha ancora attivato l'opzione). Job `pg_cron`
`solleciti-automatici-giornaliero` registrato sul database reale
(`0 7 * * *`, le 9:00 in Italia in questo periodo — verificato in
`cron.job`, attivo): chiama la funzione una volta al giorno passando
`X-Cron-Secret`, senza toccare nessuna azienda finché non attiva
l'opzione dalle sue Impostazioni.

Nuovi test: `verify_solleciti_logic.mjs` (Node, arithmetic) e
`test91_impostazioni_azienda.py` esteso con gli scenari F/G/H
(default spento, blocco senza email, salvataggio corretto).
Regressione completa (43 file Playwright) passata.

## Magazzino — depositi e giacenze

Dal confronto con Danea Easyfatt/Fatture in Cloud: mancava del tutto
una giacenza. Il Catalogo (`prodotti.html`) teneva solo anagrafica e
prezzi — nessuna colonna, da nessuna parte, diceva "quanti ne hai".
Prima di poter costruire il "multi-deposito" chiesto dall'utente
serviva costruire la giacenza vera e propria: un solo deposito è
comunque un deposito.

Nuova migrazione `0009_magazzino.sql`:

- `depositi` — sedi/depositi di un'azienda, con al più un
  "predefinito" (vincolo reale via indice unico parziale, non solo
  una convenzione lato client). Un'azienda nuova non ne ha nessuno:
  `store.ensureDefaultDeposito()` gliene crea uno "Sede principale" al
  volo alla prima apertura di `magazzino.html`.
- `movimenti_magazzino` — **immutabile come una riga di prima nota**:
  niente policy di update/delete. Un movimento sbagliato si corregge
  con un altro movimento di segno opposto (una "rettifica"), non
  modificando o cancellando quello sbagliato. Un vincolo del database
  impedisce di registrare un "carico" negativo o uno "scarico"
  positivo per errore.
- vista `giacenze` — la giacenza corrente (somma dei movimenti) per
  ogni coppia prodotto/deposito, calcolata al volo: **mai una colonna
  salvata da tenere sincronizzata a mano**, non può mai andare fuori
  sincrono con la sua storia. `security_invoker = true` perché una
  vista gira di default coi privilegi di chi l'ha creata, non di chi
  la interroga — senza, avrebbe bypassato la RLS di
  `movimenti_magazzino`.

Nuova pagina `magazzino.html` (voce "Magazzino" in sidebar, sotto
Catalogo): gestione depositi (aggiungi/rinomina/elimina — eliminarne
uno con movimenti già registrati dà un errore leggibile, il vincolo
`on delete restrict` lo impedisce comunque a livello database), ricerca
prodotto con giacenza per deposito affiancata (**mai un pivot su tutto
il catalogo**: 21.278 righe per Ipsofarma, stessa cautela già presa in
`prodotti.html` — la giacenza arriva con una query in più sui soli
risultati trovati), modulo "+ movimento" (carico/scarico/rettifica,
riusa `SaasProdPicker` per cercare il prodotto), storico movimenti
recenti. `prodotti.html` mostra ora anche una colonna "Giacenza"
(somma di tutti i depositi) per collegare i due moduli.

**Deliberatamente manuale**: creare un DDT o una fattura non genera
ancora un movimento da solo (lo fanno Danea/Fatture in Cloud) — passo
rimandato apposta, richiederebbe scegliere un deposito su ogni
documento esistente e gestire con cura modifiche/cancellazioni per non
contare due volte lo stesso movimento.

Niente Edge Function nuova stavolta (tutto client-side via `store.js`),
quindi il collaudo passa direttamente dai test Playwright: nuovo
`test115_magazzino.py` (depositi, movimento carico/scarico con segno
corretto a prescindere da cosa digita l'utente, giacenza aggiornata
subito, errore leggibile su un deposito con movimenti già registrati).
`test87_prodotti_page.py` esteso con lo scenario B2 (colonna
Giacenza). Regressione completa (44 file) passata.

**Migrazione distribuita**: applicata su Supabase (progetto reale) via
Management API — tabelle `depositi`/`movimenti_magazzino` e vista
`giacenze` verificate presenti. Il modulo è operativo end-to-end.

## Riconciliazione bancaria (via CSV)

Ultimo gap del confronto risolvibile senza un account esterno (gli
altri due — pagamenti online in fattura, invio reale allo SDI —
restano in attesa di Stripe/un provider SDI). Fatture in
Cloud/TeamSystem collegano il conto corrente direttamente via Open
Banking, un provider a pagamento che non esiste qui: l'alternativa
praticabile senza account esterni è il file — carichi l'estratto conto
in CSV, il gestionale propone gli abbinamenti con le fatture aperte.

Nuova pagina `riconciliazione.html` (voce "Riconciliazione bancaria" in
sidebar, vicino a Scadenziario — tocca sia le fatture cliente sia
quelle fornitore, non stava bene in nessuno dei due gruppi):

1. **Carica il file** — un parser CSV minimale scritto direttamente
   nella pagina (nessuna Edge Function: legge e abbina solo dati già
   suoi, niente da nascondere lato server), virgola o punto e virgola,
   campi tra virgolette.
2. **Mappa le colonne** — ogni banca esporta un formato diverso, non
   c'è un formato "corretto" da indovinare: l'utente sceglie quale
   colonna è la data, quale la descrizione, quale l'importo (con un
   suggerimento automatico dal nome della colonna, sempre correggibile)
   — mai un riconoscimento silenzioso su un'operazione che tocca i
   soldi. Supporta sia un'unica colonna con importo con segno sia due
   colonne separate Entrate/Uscite.
3. **Rivedi gli abbinamenti proposti** — un abbinamento viene proposto
   **solo per corrispondenza esatta** (al centesimo) col residuo di una
   fattura aperta (stessa aritmetica di `dashboard.html`: sconto, IVA,
   note di credito già dedotte, sia lato cliente sia lato fornitore).
   Nessun "abbinamento probabile" scelto in automatico: sbagliarlo
   registrerebbe un incasso/pagamento sulla fattura sbagliata. Senza
   corrispondenza esatta, la riga resta senza spunta e l'utente sceglie
   a mano dal menu (o la salta).
4. **Registra** — stesso schema già usato da `togglePaid()`/
   `bulkMarkPaid()` in `fatture.html`/`fatture-fornitore.html`: un
   patch parziale `{id, pagamenti, paid, paidDate}` via
   `store.saveDoc()`, non l'intero documento. Nessuna funzione nuova in
   `store.js` — riusa quella già esistente e già collaudata.

Nuovo `test116_riconciliazione.py` (mappatura con suggerimento
automatico dal nome colonna, due abbinamenti esatti proposti e uno
scartato, registrazione che aggiorna le fatture giuste). Regressione
completa (45 file) passata.

## "Non vedo 'Invita una persona'" — bug reale in list_members()

Segnalato dall'utente: un amministratore apriva Impostazioni → Team e
non vedeva affatto la sezione per invitare qualcuno — pur essendo
admin di entrambe le sue aziende, confermato via query diretta sul
database.

Diagnosi fatta sui log reali del progetto (non ipotesi): la chiamata
`POST /rest/v1/rpc/list_members` falliva sempre con HTTP 400,
`proxy_status: PostgREST; error=42804` — SQLSTATE 42804,
"structure of query does not match function result type". La causa:
`list_members()` (`0008_inviti.sql`) dichiara `email text` nel
`RETURNS TABLE`, ma legge `auth.users.email`, che nel database è
`varchar(255)`, non `text`. Un `RETURN QUERY` in PL/pgSQL richiede una
corrispondenza di tipo ESATTA (non solo compatibile) — la funzione non
ha mai funzionato, da quando esiste.

L'effetto lato pagina era **silenzioso**: `impostazioni-azienda.html`
chiamava `renderTeam()` senza `await`/`catch`, quindi il fallimento di
`store.listMembers()` interrompeva la funzione PRIMA della riga che
mostra "Invita una persona" — nessun messaggio d'errore, la sezione
spariva e basta, per qualunque admin.

Corretto in due punti:
- Nuova migrazione `0010_fix_list_members.sql`: `u.email::text` invece
  di `u.email` — applicata e verificata sul progetto reale
  (`select * from list_members(...)` con un contesto utente simulato,
  riga restituita correttamente).
- `impostazioni-azienda.html`: `renderTeam()` ora ha un `try/catch`
  vero — un futuro errore mostra un messaggio leggibile (`#team-msg`)
  invece di far sparire la sezione in silenzio.

Nuovo scenario in `test91_impostazioni_azienda.py` (un `listMembers()`
che fallisce mostra l'errore, non un vuoto). Regressione completa (45
file) passata.

## IA — piano di miglioramento, punto 1: import da PDF/foto esteso

Richiesto dall'utente: concentrarsi sull'IA in ogni suo aspetto, perché
è il vero differenziale rispetto alla concorrenza (vedi "Studio: parità
funzionale" — nessuno dei tre gestionali confrontati offre "carica una
foto, compilo qualunque documento"). Ordine concordato: (1) estendere
l'import da allegato oltre le sole fatture fornitore, (2) un
assistente più ricco di dettaglio, (3) verifica incrociata coi dati
del catalogo, (4) modello più accurato per l'estrazione, (5) azioni
autonome con anteprima — quest'ultima rimandata apposta a quando tutto
il resto è solido.

**Punto 1**: l'import esisteva solo in `fatture-fornitore.html` —
fattorizzato in un modulo condiviso, `app/ai-import.js` (lettura file,
rasterizzazione PDF via pdf.js, parsing della risposta JSON, ricerca
controparte per nome), poi esteso a:
- `ordini.html` — un ordine ricevuto da un CLIENTE (spesso una foto
  WhatsApp o un PDF via email, non solo a voce).
- `ordini-fornitore.html` — digitalizzare un proprio ordine (lista
  scritta a mano, preventivo del fornitore).
- `note-credito-fornitore.html` — una nota di credito ricevuta dal
  fornitore (stesso ragionamento di una fattura fornitore: un
  documento che arriva da fuori).

**Deliberatamente NON esteso** a `ddt.html`, `fatture.html`,
`preventivi.html`, `note-credito.html`: sono documenti che l'azienda
crea da zero per un cliente, non ne esiste una versione esterna da
fotografare prima di averli fatti — estenderlo lì non avrebbe un
documento sorgente reale da leggere.

`fatture-fornitore.html` stessa refactorizzata per usare il modulo
condiviso invece della sua copia locale (stessa funzione, meno codice
duplicato) — collaudo esistente (`test101_importa_ai.py`) passato
senza modifiche, a conferma che il comportamento non è cambiato.

Nuovo `test117_importa_ai_estesa.py` (un caso per pagina: campi giusti
precompilati, controparte giusta cercata — gli scenari di errore
restano coperti una sola volta, nel modulo condiviso, da
`test101_importa_ai.py`). Regressione completa (46 file) passata.

## IA — piano di miglioramento, punto 2: assistente più ricco di dettaglio

**Punto 2**: `assistente-ai.html` prima passava all'IA solo aggregati
(quanto deve un cliente in totale, quanto fatturato nel mese) — non
c'era modo di chiedere "la fattura FT-123 è stata pagata?" o "cosa mi
deve ancora Farmacia Bianchi, nel dettaglio?" senza che l'IA
rispondesse a vuoto (i dati non erano nel contesto). Due modifiche:

1. **Riepilogo più ricco** (`buildContext()`, sempre inviato): oltre ai
   totali per cliente/fornitore, ora elenca le fatture scadute (non
   solo "da incassare" — proprio quelle il cui termine di pagamento è
   già passato, le più vecchie per prima, con un tetto di 15 righe
   nel messaggio così l'elenco non cresce senza limite con aziende
   grandi), i 5 prodotti più venduti/acquistati nel mese (quantità),
   e i conteggi di preventivi/DDT ancora aperti — collezioni prima
   non caricate affatto da questa pagina.
2. **Ricerca mirata** (`findMirroredDetail()`, nuova): se la domanda
   cita per intero il numero di un documento (una qualunque delle 8
   collezioni: fatture, ordini, note credito, preventivi, DDT) o il
   nome esatto di un cliente/fornitore, un secondo messaggio di
   sistema — più specifico del riepilogo aggregato, esplicitamente
   segnalato come tale nel prompt — allega il dettaglio vero: righe
   con prezzo/sconto/IVA e stato di pagamento per un documento
   preciso, oppure lo storico delle fatture ancora aperte per una
   controparte precisa. Deliberatamente una corrispondenza di
   stringa, non un retrieval semantico vero: con numeri documento e
   nomi propri è quasi sempre sufficiente, e non richiede un indice a
   parte da mantenere aggiornato.

`DB` (le collezioni caricate una volta all'apertura, tenute in
memoria) è ora condiviso tra `buildContext()` e `findMirroredDetail()`
invece di essere ricalcolato o passato come argomenti posizionali.

Nuovi scenari in `test100_assistente_ai.py`: il riepilogo aggregato
contiene le nuove sezioni (scadute, top prodotti, preventivi/DDT); una
domanda che cita un nome esatto allega il dettaglio del cliente
(fatture aperte, importi); una domanda che cita un numero documento
esatto allega il dettaglio riga per riga di quel documento. Regressione
completa (61 file — sono stati aggiunti test dall'ultimo conteggio)
passata.

## IA — piano di miglioramento, punto 5: verifica incrociata col catalogo

**Punto 5**: le righe lette dall'AI da un allegato (fatture-fornitore.html,
ordini.html, ordini-fornitore.html, note-credito-fornitore.html — gli
stessi 4 moduli del punto 1) venivano precompilate così com'erano,
codice e descrizione compresi — ma un OCR/una lettura da foto può
storpiare una cifra di un codice o una parola della descrizione, e non
c'era nessun controllo prima di mostrarle. Nuova `crossCheckRighe()`
in `app/ai-import.js`, agganciata subito dopo `extractFromFile()` in
tutti e quattro i moduli, prima di renderizzare le righe:

- **Codice trovato per intero a catalogo** (`store.searchProdotti()`,
  server-side — mai l'intero catalogo scaricato) → la descrizione
  viene sostituita con quella ufficiale del prodotto (più affidabile
  di quella letta dalla foto); riga marcata "✓ a catalogo".
- **Codice non letto (o non trovato), ma la descrizione combacia con
  UN solo prodotto** (confronto normalizzato: minuscolo, punteggiatura
  ridotta a spazi) → il codice viene completato da lì; riga marcata
  "✓ codice completato".
- **Nessun riscontro** → la riga resta com'è (non è per forza un
  errore di lettura: può essere un prodotto non ancora a catalogo),
  ma è marcata "⚠ non in catalogo" perché l'utente la verifichi prima
  di salvare.

Non tocca mai qty/prezzo/sconto/iva/lotto/scadenza: sono dati della
transazione specifica, non del catalogo (un prezzo pattuito può
legittimamente differire dal listino). Un badge per riga (nuove classi
`.cat-badge`/`.cat-ok`/`.cat-warn` in `theme.css`) compare solo per le
righe appena importate dall'AI — assente per una riga aggiunta a mano
o già presente in un documento salvato in precedenza. Il messaggio di
stato dell'import riassume anche quante righe restano da verificare.

Se la ricerca a catalogo fallisce (rete assente/lenta) la riga resta
semplicemente "non in catalogo" — non è mai un blocco al salvataggio.

Nuovi scenari in `test101_importa_ai.py` (i tre esiti — trovato,
completato, non trovato — con un piccolo catalogo finto) e in
`test117_importa_ai_estesa.py` (un caso per le altre tre pagine, a
conferma che ognuna chiama davvero `crossCheckRighe()`). Regressione
completa passata.

## IA — piano di miglioramento, punto 4: modello più accurato per l'estrazione

**Punto 4**: `ai-proxy` (l'unica Edge Function che parla con Gemini,
vedi Fase 3) girava sempre con `gemini-2.5-flash` — economico e
veloce, adatto alla chat sola-lettura di `assistente-ai.html` (una
domanda mal interpretata non scrive nulla), ma lo stesso modello
veniva usato anche per leggere un allegato: lì un carattere letto male
in un codice, un prezzo o una data finisce dritto in un documento
contabile, con conseguenze economiche reali.

`extractFromFile()` in `app/ai-import.js` (il punto d'ingresso unico
usato dai 4 moduli con import da allegato) ora chiede esplicitamente
`gemini-2.5-pro` — più accurato, a costo di essere più lento e più
caro, un compromesso che ha senso solo quando conta la precisione più
della velocità. La chat di `assistente-ai.html` non passa un modello
esplicito e resta quindi su `gemini-2.5-flash`, invariata.

`ai-proxy` non si fida ciecamente del modello richiesto dal client: un
elenco chiuso lato server (`gemini-2.5-flash`/`gemini-2.5-pro`) — un
valore imprevisto (bug del client, o richiesta forgiata a mano con la
sessione di un utente vero) ricade sul default economico invece di
girare la chiave condivisa su un modello arbitrario. Ridistribuita
(versione 11), verificata viva con una chiamata senza autenticazione
(401 atteso, a conferma che il deploy non ha rotto nulla — collaudo
end-to-end con una lettura vera già coperto in Fase 3).

Nuova asserzione in `test101_importa_ai.py`/`test117_importa_ai_estesa.py`:
la chiamata a `store.aiComplete()` durante un import porta sempre
`opts.model === 'gemini-2.5-pro'`. Regressione completa passata.

## IA — piano di miglioramento, punto 3: azioni autonome con anteprima

**Punto 3**, l'ultimo e il più rischioso della lista — rimandato apposta a
quando tutto il resto era solido. Porta di `aiView()`/`aiResolve()`/
`aiShowPlan()`/`aiExecute()` dal gestionale originale (`index.html`): lì
un'unica istruzione in linguaggio naturale diventa un PIANO di azioni in
JSON, ognuna risolta in un'anteprima testuale — **nessuna scrittura
avviene prima che l'utente clicchi "Conferma ed esegui"**.

**Scoperta di percorso, prima di scrivere codice**: la cascata "genera
DDT/fattura/ordine fornitore da un ordine cliente" (`aiGenDDT`/`aiGenFT`/
`aiGenOF` nell'originale) NON esiste ancora come funzione di base del
prodotto SaaS — `ordini.html` qui non ha nemmeno i campi per tracciarla
(`qtyEv`/`ddtId`/`ftId`). Aggiungerla è un pezzo a sé, non piccolo,
indipendente dall'IA. Chiesto esplicitamente: procedere solo con le
azioni già del tutto supportate oggi, lasciando la cascata come pezzo
futuro a sé (prima come funzione normale del gestionale, poi
eventualmente agganciata all'IA) — scelta confermata dall'azienda.

**Cosa fa** (nuova sezione "Esegui un'azione" in `assistente-ai.html`,
sotto la chat esistente — deliberatamente separata dalla chat sola-lettura,
niente ambiguità nell'interpretare un'istruzione come domanda o comando):
- `mark_paid`/`mark_unpaid` — segna pagate/da pagare le fatture cliente o
  fornitore, filtrabili per controparte e periodo (un mese o un intervallo).
- `create_order`/`create_quote` — crea un ordine cliente o un preventivo:
  cliente cercato in anagrafica (mai creato automaticamente — stessa
  scelta del punto 1: se non esiste, va creato prima a mano), righe
  prodotto cercate a catalogo (`store.searchProdotti`, stessa euristica di
  `aiFindProd()` nell'originale: codice esatto, poi descrizione con tutte
  le parole cercate, poi il primo risultato).

Ogni azione risolta produce `{desc, apply}`: `desc` è l'anteprima HTML
mostrata SEMPRE (anche per un'azione non eseguibile, con il motivo); `apply`
è `null` se non eseguibile, altrimenti una funzione asincrona che scrive
solo quando l'utente conferma (`store.saveDoc`/`nextNumber`/
`checkDocLimit` — le stesse chiamate che usano già le pagine normali).
Dopo l'esecuzione, tutte le collezioni vengono ricaricate (`loadDB()`,
fattorizzata da `init()` per essere richiamabile anche da qui): la chat e
la ricerca mirata (punto 2) vedono subito i dati aggiornati, senza
ricaricare la pagina.

Come il punto 4, l'interpretazione dell'istruzione usa `gemini-2.5-pro`
(non l'economico `gemini-2.5-flash` della chat): un'azione mal
interpretata scrive un documento vero, non solo una risposta imprecisa.

Nuovo `test118_azioni_ai.py` (10 scenari): anteprima corretta per
mark_paid/mark_unpaid con controparte+periodo, create_order/create_quote
con prodotto cercato a catalogo e prezzo indicato dall'utente o dal
listino, nessuna scrittura prima della conferma, cliente non trovato →
non eseguibile senza pulsante Conferma, un piano misto esegue solo la
parte valida, nessuna azione riconosciuta → spiegazione senza pulsante,
risposta non-JSON dall'AI → errore chiaro, limite piano raggiunto →
errore mostrato senza scrivere nulla, modello richiesto sempre
`gemini-2.5-pro`, ricaricamento dati dopo la conferma. Regressione
completa (62 file) passata.

Con questo si chiude l'intero piano di miglioramento IA (1→2→5→4→3)
concordato con l'azienda.

## Cascata ordine → DDT → fattura, e ordine → ordine fornitore

Scoperta lavorando al punto 3 dell'IA: la cascata di generazione
documento→documento del gestionale originale (`aiGenDDT()`/`aiGenFT()`/
`genOFFromOC()`) non esisteva ancora come funzione di base del prodotto
SaaS — `ordini.html` non aveva nemmeno i campi per tracciarla. Portata
ora come pezzo a sé (pulsanti normali, non IA), su richiesta esplicita
dell'azienda dopo aver segnalato la scoperta.

**Nessuna migrazione richiesta**: ogni collection ha già una colonna
"extra" (jsonb) per i campi non mappati esplicitamente (vedi
`store.js`) — `ddtIds`/`ftIds`/`ofIds`/`ftId`/`ddtId`/`ofId`/`ocId` ci
finiscono automaticamente, e `qtyEv` ("quantità evasa") vive dentro
`righe`, già una colonna jsonb. Un ordine mai toccato dalla cascata ha
questi campi assenti, equivalenti a "niente ancora evaso" — nessun
impatto sui dati esistenti.

**Come funziona**:
- **Ordine → DDT** (`ordini.html`, pulsante "📦 DDT" su una riga
  selezionata): calcola il residuo di ogni riga (`qty - qtyEv`) e apre
  `ddt.html` con l'ordine già selezionato e le righe precompilate dal
  residuo — tutto in un colpo solo (niente editor per-riga interattivo
  come nell'originale: si può comunque modificare quantità/lotto prima
  di salvare). Se non c'è nulla da consegnare, un avviso invece di
  aprire un DDT vuoto.
- **DDT → Fattura** (`ddt.html`, pulsante "🧾 Fattura", visibile solo
  se il DDT non è già stato fatturato): apre `fatture.html` con
  cliente/ordine/DDT/destinazione/righe già precompilati.
- **Ordine → Ordine fornitore** (`ordini.html`, pulsante "🏭
  Ord.forn."): raggruppa le righe non ancora coperte da un ordine
  fornitore collegato, per fornitore abituale del prodotto (catalogo);
  crea o aggiorna l'ordine fornitore necessario, usando il listino di
  acquisto come prezzo (l'originale guarda l'ultimo prezzo pagato,
  funzione non ancora portata nel SaaS). Idempotente: richiamarlo
  quando è già tutto coperto non duplica nulla.
- **Fattura fornitore → evasione**: salvare una fattura fornitore
  collegata a un ordine fornitore (il campo "Ordine collegato" già
  esisteva) segna come ricevute (`qtyEv`) le quantità fatturate —
  porta semplificata di `markOFReceived()` (qui "fatturato" vale come
  "ricevuto", nessun tracciamento separato arrivo/fattura).

Badge di stato ("✓ Consegnato"/"Parziale X/Y" in `ordini.html`, "✓
Ricevuto"/"Parziale X/Y" in `ordini-fornitore.html`, nuove classi
`.badge.ok`/`.badge.info` in `theme.css`) e un riquadro "Documenti
collegati" nel form di modifica di un ordine, con i numeri di
DDT/fatture/ordini fornitore generati.

**Semplificazione dichiarata**: `qtyEv`/`ddtIds`/`ftIds`/`ofIds` si
aggiornano solo alla CREAZIONE del documento a valle — modificarlo o
eliminarlo in seguito non li aggiusta retroattivamente (l'originale
aveva `resyncOFInvoiced()` per questo, non portata). Per un uso
normale (genera → eventualmente correggi un dettaglio, non cancelli
un documento a monte) è sufficiente; un disallineamento vero si
corregge comunque a mano modificando l'ordine.

**Bug reale trovato e corretto durante questo lavoro**: l'editor delle
righe di `ordini.html`/`ordini-fornitore.html` non conosceva `qtyEv` —
salvare una modifica qualunque a un ordine già (parzialmente) evaso lo
azzerava silenziosamente, con il rischio concreto di generare un DDT
doppio sulla stessa merce già consegnata (o segnare due volte come
ricevuto lo stesso arrivo). Stesso problema per `ddtIds`/`ftIds`/
`ofIds`/`emailSent` (tutti nella colonna "extra": un salvataggio che
non li include esplicitamente la svuota). Corretto in entrambi i
salvataggi: si riparte dal documento esistente (non da un oggetto
vuoto) e si abbina `qtyEv` per codice riga, non per indice — resiste a
righe riordinate o aggiunte durante la modifica.

Nuovo `test119_cascata_documenti.py` (9 scenari, con un mock che
mantiene lo stato in `localStorage` — non in `window.*`, che si
azzererebbe ad ogni cambio pagina — per riprodurre davvero la
navigazione reale tra le pagine coinvolte nella cascata): genera DDT
dal residuo pieno, "tutto già consegnato" quando non c'è nulla da
evadere, **modificare l'ordine dopo aver generato un DDT non azzera
qtyEv/ddtIds** (il bug corretto sopra), DDT→fattura con collegamento
corretto, il pulsante "Genera fattura" sparisce una volta fatturato,
ordine→ordine fornitore con raggruppamento per fornitore e prezzo dal
listino d'acquisto, idempotenza, fattura fornitore collegata aggiorna
`qtyEv` dell'ordine fornitore, **modificare l'ordine fornitore non
azzera qtyEv** (stesso bug, sul lato fornitore), badge di stato
corretti. Regressione completa (63 file) passata.

## La cascata collegata all'IA — chiusura del punto 3

Il pezzo che era stato rimandato ("prima costruisco la cascata come
funzione normale, poi eventualmente la aggancio all'IA") è ora
agganciato: `assistente-ai.html` → "Esegui un'azione" riconosce anche
`generate_ddt`/`generate_invoice`/`generate_supplier_order` (es.
"genera DDT e fattura dell'ordine 7", "ordina al fornitore quanto
serve per l'ordine 12").

**Prima del collegamento**, la logica della cascata è stata
**fattorizzata fuori da ordini.html/ddt.html/fatture.html/
fatture-fornitore.html**, in un nuovo modulo condiviso
`app/cascade.js` (`SaasCascade`) — non per pulizia fine a sé stessa,
ma per un motivo concreto: l'azione IA e i bottoni manuali devono fare
esattamente la stessa cosa, e tenerla in un posto solo è l'unico modo
per esserne certi (è la stessa classe di bug appena corretta —
`qtyEv` azzerato silenziosamente — che una seconda copia della logica,
scritta ora per l'IA, avrebbe potuto reintrodurre in un punto diverso
senza che i test della prima lo notassero). Le pagine esistenti sono
state riscritte per chiamare `SaasCascade.*` invece delle loro copie
locali: stesso comportamento, stessi test di `test119_cascata_documenti.py`
verificati ancora verdi dopo il refactor, prima di aggiungere l'azione IA.

**Differenza voluta rispetto ai bottoni manuali**: l'azione IA è
"headless" — genera direttamente (`SaasCascade.creaDDTDaResiduo()`/
`creaFattureDaOrdine()`), senza aprire ddt.html/fatture.html per una
revisione manuale delle righe: l'anteprima del piano (righe e quantità
mostrate prima di "Conferma ed esegui") fa già quel lavoro.
`generate_invoice` fattura TUTTI i DDT dell'ordine non ancora
fatturati in un colpo solo (porta di `aiGenFT()`, diversa dal bottone
"🧾 Fattura" di ddt.html che ne fattura uno alla volta): "genera DDT e
fattura dell'ordine X" diventa due azioni in sequenza nel piano,
esattamente come nel gestionale originale.

Nuovi scenari in `test118_azioni_ai.py` (K→O, incatenati apposta: lo
scenario K genera il DDT, lo scenario M lo fattura, verificando che
l'azione IA veda davvero lo stato lasciato da un'azione precedente):
generate_ddt dal residuo con anteprima delle righe, "già tutto
consegnato" → non eseguibile, generate_invoice fattura il DDT giusto e
collega ddt/ordine, "nessun DDT da fatturare" → non eseguibile,
generate_supplier_order raggruppa per fornitore e prezzo dal listino
d'acquisto, idempotenza, "ordine non trovato" per tutte e tre.
Regressione completa (63 file) passata.

## Limite mensile di uso dell'IA per azienda

Chiude una domanda concreta: *l'IA funziona ancora bene se la usano
tante aziende insieme?* Per l'isolamento dei dati sì (RLS già lo
garantiva, verificato nel codice) e l'infrastruttura scala da sola
(ai-proxy è una funzione serverless, non un server con un numero fisso
di "posti"). Il punto debole vero era il costo: **una sola chiave
Gemini condivisa da tutte le aziende del SaaS**, pagata da chi gestisce
il prodotto — e fino ad ora nessun limite frenava quante domande alla
chat, quante azioni o quante letture di PDF/foto (il modello più caro,
gemini-2.5-pro) un'azienda potesse fare in un mese. Un uso molto
intenso da parte di una sola azienda sarebbe costato uguale a nessun
uso, a parità di abbonamento.

**Migrazione `0011_limite_ai.sql`**: nuova tabella `ai_usage` (una riga
per ogni chiamata inoltrata a Gemini, RLS "solo la propria azienda,
niente update/delete dal client"), colonna `plans.limite_ai_mese`
(trial 50, base 300, pro 1000 al mese — a differenza di
`limite_documenti_mese`, qui anche i piani a pagamento hanno un
limite: non è una leva di vendita ma un freno sul costo), e la funzione
`count_ai_usage_this_month()` (security definer, stesso schema di
sicurezza di `next_document_number()`/`list_members()`).

**Applicazione VERA, lato server, in `ai-proxy`** — non aggirabile dal
client: la richiesta ora porta anche `companyId` (verificato che
l'utente appartenga davvero a quell'azienda, non a "una qualunque"
come prima), il conteggio del mese viene controllato PRIMA di
chiamare Gemini (429 con un messaggio chiaro se già raggiunto), e ogni
chiamata che arriva a Gemini viene registrata in `ai_usage` DOPO
(indipendentemente dall'esito: rispecchia meglio "quante volte
abbiamo occupato la chiave", e un fallimento nella registrazione non
fa sembrare fallita una risposta arrivata bene). Ridistribuita
(versione 12), verificata viva con una chiamata senza autenticazione.

**Lato client**: `store.aiComplete()` ora richiede `companyId` (lancia
un errore se manca — un bug interno da scoprire subito, non in
produzione) e lo inoltra sempre; tutti i chiamanti (`ai-import.js`,
`assistente-ai.html` chat e azioni) aggiornati per passarlo. Nuovo
`store.checkAiLimit()` (stesso schema di `checkDocLimit()`) usato in
`assistente-ai.html` per un avviso proattivo — un banner chiaro con
bottoni disabilitati (anche il tasto Invio, non solo il clic) invece
di scoprire il limite dopo aver scritto la domanda; se il controllo
stesso fallisce (rete), l'assistente resta comunque usabile — non si
blocca da solo per un problema che non è colpa del limite.

Nuovo `test120_limite_ai.py` (4 scenari): nessun avviso entro il
limite, `companyId` passato sempre a `store.aiComplete()` da chat e
azioni, banner + bottoni disabilitati + invio bloccato da tastiera
quando il limite è raggiunto, l'assistente resta usabile se il
controllo del limite fallisce. Nuove asserzioni `companyId` in
`test100_assistente_ai.py`/`test101_importa_ai.py`/
`test117_importa_ai_estesa.py`/`test118_azioni_ai.py`. Regressione
completa (65 file) passata.

## Tour guidato al primo accesso

Richiesta dell'azienda: *"sarebbe carino al primo accesso un tutorial
tour guidato che spiega il programma"*. Chi apre il gestionale per la
prima volta su un dispositivo si trova davanti undici voci di menu
senza nessuna guida — un tour di 9 passi (~2 minuti) le presenta una
per una, in linguaggio semplice, prima di lasciarlo esplorare da solo.

**Resta sempre sulla pagina in cui ci si trova**, non naviga mai
davvero: ogni passo evidenzia una voce della sidebar (identica su ogni
pagina, vedi `app/nav.js`), quindi funziona a prescindere da dove
l'utente sia atterrato dopo il login — oggi `clienti.html`, non
`dashboard.html` come si potrebbe pensare, e il tour non deve
dipendere da quel dettaglio.

**Il problema tecnico vero era il velo scuro**: l'idea ovvia — dimming
a tutto schermo più uno `z-index` alto sull'elemento evidenziato per
farlo "bucare" sopra — non funziona qui, perché `.sidebar` ha
`position:sticky`, che per specifica crea SEMPRE un proprio contesto
di impilamento. Uno z-index su un suo elemento interno resta
intrappolato dentro quel contesto e non può mai numericamente superare
un velo esterno (fratello di `.sidebar`, non discendente) con z-index
più alto. Risolto scartando l'idea di "bucare" il velo: **quattro
rettangoli** (sopra/sotto/sinistra/destra del riquadro dell'elemento,
mai sopra di lui) lasciano l'elemento nel suo punto normale del DOM,
mai davvero coperto — nessuno z-index da far vincere. Verificato non
solo a ragionamento ma con uno screenshot reale (tema chiaro e scuro):
il link "Dashboard" resta perfettamente cliccabile e visibile, col
solo contorno decorativo `.tour-spotlight`.

**Stato**: `localStorage` (`saas_tour_done`), come `saas_theme` — per
dispositivo/browser, non per azienda: chi si unisce dopo a
un'azienda già avviata vede comunque il tour la prima volta che apre
il gestionale su quel dispositivo. Un pulsante "🎓 Rifai il tour" in
fondo al menu (`app/nav.js`) lo fa ripartire in ogni momento,
ignorando il flag. Un solo punto di innesco (`SaasNav.render()` chiama
`SaasTour.maybeStart()` alla fine) invece di doverlo aggiungere
all'`init()` di ogni pagina — basta includere `app/tour.js` accanto ad
`app/nav.js`, fatto su tutte le pagine con sidebar (21, non su
`index.html` che non ne ha una).

Frecce ← →, Esc per saltare, clic fuori dal riquadro per saltare —
oltre ai pulsanti "Indietro"/"Avanti"/"Salta il tour" nella card.

**Un vero effetto collaterale trovato in regressione**: appena
`app/tour.js` è finito su ogni pagina, 34 test preesistenti (dal
vecchio `test73` al recente `test120`) hanno iniziato a fallire — non
per un bug nel tour, ma perché ogni test apre una pagina con un
browser/localStorage vuoto, quindi il tour parte davvero, e il suo
velo (`.tour-curtain`) intercetta i clic sui pulsanti che i test
volevano premere (`Page.click: ... <div class="tour-curtain">
intercepts pointer events`). Corretto impostando
`localStorage.setItem('saas_tour_done','1')` nel setup di ogni test
esistente, accanto a dove già impostano `saas_company_id` — lo stesso
accorgimento già usato da `test103_tema_chiaro_scuro.py`, scritto
prima che il tour esistesse ma già per un motivo simile (evitare
interferenze da stato non pertinente al test).

Nuovo `test121_tour.py` (9 scenari): parte da solo al primo accesso,
passo 1 di 9 senza bersaglio (velo unico, nessuno spotlight), Avanti
mostra il passo 2 con bersaglio (4 rettangoli-velo + spotlight, niente
z-index/position forzati sull'elemento), Indietro torna al passo
precedente, Esc salta e salva il flag, dopo un reload il tour NON
riparte da solo, "Rifai il tour" lo fa ripartire ignorando il flag,
"Salta il tour" chiude come Esc, si arriva fino al passo 9 di 9
("Fine" invece di "Avanti →"), funziona anche su una pagina diversa
dalla dashboard. Regressione completa (65 file) passata: solo i due
fallimenti preesistenti gated da credenziali reali
(`test71_store_live.py`/`test71_store_rest.py`).

## Bottoni della cascata visibili dentro il form dell'ordine

Segnalazione dell'azienda: *"ho inserito un ordine cliente ma non ho
trovato il pulsante per trasformarlo in un ordine fornitore come nel
vecchio gestionale"*. Il pulsante c'era già (🏭 Ord.forn., aggiunto con
la cascata) ma solo sulla riga dell'elenco, e solo dopo aver spuntato
la riga — stesso schema di "azioni visibili solo con la spunta" usato
in tutti gli elenchi documento. Nel vecchio gestionale, invece, il
pulsante stava sempre in vista nella vista di dettaglio del documento
appena aperto: facile da perdere nella nuova posizione per chi veniva
da quell'abitudine.

**Fix**: gli stessi due passi successivi di un ordine cliente ("→
Genera DDT" e "→ Genera ordine fornitore") compaiono ora anche dentro
il form di modifica, appena sotto cliente/data, sempre visibili quando
si apre un ordine già salvato (non per un ordine nuovo, non ancora
salvato: non c'è ancora nulla da generare). Etichetta a tre stati come
nel vecchio gestionale (`genOF()`/`ofBtnLabel`): "→ Genera ordine
fornitore" (nessun OF ancora), "+ Ordina N articoli mancanti" (OF
presente ma incompleto, es. articoli aggiunti dopo), "✓ Ordine
fornitore" (tutto coperto, disabilitato) — e lo stesso per il DDT ("→
Genera DDT" / "✓ Consegnato"). Cliccando dentro il form la pagina non
naviga via e non torna all'elenco: il form si riapre da solo con
l'ordine aggiornato (collegamenti e stato dei bottoni), invece di
lasciare l'utente a chiedersi se il clic abbia funzionato.

Il calcolo dello stato dell'ordine fornitore richiede una lettura di
rete (bisogna sapere quali articoli sono già coperti dagli OF
collegati) — la stessa identica query che già faceva
`generaOrdiniFornitore()` per decidere cosa creare, ora estratta in
`righeNonOrdinate()` (app/cascade.js) e riusata da entrambe: la nuova
`statoOrdineFornitore()` per l'etichetta, e `generaOrdiniFornitore()`
per l'azione — un solo posto che decide "cosa manca", non due che
potrebbero raccontare stati diversi (lo stesso principio già seguito
per tutta la cascata).

I bottoni nella riga dell'elenco restano al loro posto (utili per
un'azione rapida senza aprire il form): questa è un'aggiunta, non una
sostituzione.

Nuovo `test122_azioni_form_ordine.py` (6 scenari): un ordine nuovo non
mostra i bottoni, un ordine esistente li mostra con l'etichetta
corretta, il clic dentro il form crea l'OF e riapre il form aggiornato
(non torna all'elenco), un ordine già evaso mostra "✓ Consegnato"
disabilitato, un prodotto senza fornitore a catalogo mostra l'avviso
giusto senza disabilitare il bottone (nulla è stato creato), il
percorso precedente dall'elenco (spunta + bottone riga) continua a
funzionare. Regressione completa (66 file) passata: solo i due
fallimenti preesistenti gated da credenziali reali
(`test71_store_live.py`/`test71_store_rest.py`).

## Campo "Fornitore abituale" mancante in Prodotti

Seguito diretto del punto precedente. Provando "Genera ordine
fornitore" su un ordine reale, l'azienda si è vista rispondere
*"Nessuno dei prodotti mancanti ha un fornitore assegnato nel
catalogo: assegnalo in Prodotti, poi riprova."* — ma in Prodotti quel
campo non esisteva affatto: il form aveva solo Codice, Confezione,
Descrizione, Prezzo acquisto/vendita, IVA. Un messaggio che rimanda a
un posto dove l'azione richiesta non si può fare.

La colonna `fornitore_id` esiste già nella tabella `prodotti` (nessuna
migrazione necessaria) — arriva popolata solo dall'import dal vecchio
gestionale, ma l'interfaccia SaaS non aveva mai avuto un modo per
leggerla o modificarla a mano. Il vecchio gestionale invece un campo
così ce l'aveva (`openProdottoForm()`, select "Fornitore"): stessa
idea qui, con un'etichetta più esplicita ("Fornitore abituale") e una
frase che spiega perché serve — nel vecchio gestionale il collegamento
con la cascata era implicito, qui va reso comprensibile a chi non lo
sapeva.

Aggiunti: il campo nel form (select con i fornitori dell'azienda, "—
nessuno —" di default), il salvataggio di `fornitoreId`, e una colonna
"Fornitore" nell'elenco — utile non solo per il form ma per capire a
colpo d'occhio quali prodotti nel catalogo sono ancora senza, prima
ancora di provare a generare un ordine fornitore e scoprirlo
dall'errore.

Nuovo `test123_prodotto_fornitore.py` (5 scenari): il campo esiste con
i fornitori dell'azienda, la colonna Fornitore compare nell'elenco,
assegnare un fornitore a un prodotto lo salva e aggiorna subito
l'elenco, riaprendo un prodotto che ne aveva già uno il campo è
precompilato, si può anche rimuoverlo. Aggiunto `loadCollection` al
mock di `test87_prodotti_page.py` (il caricamento dei fornitori nel
nuovo `init()` altrimenti lo avrebbe rotto). Regressione completa (67
file) passata: solo i due fallimenti preesistenti gated da credenziali
reali (`test71_store_live.py`/`test71_store_rest.py`).

## Prossimo passo

Tre filoni distinti, tutti rimandati per scelta esplicita dell'azienda:

1. **Stripe in modalità live**: sandbox collaudata (account, prezzi,
   checkout, webhook — vedi Fase 5). Per far pagare un cliente vero
   serve ripetere la stessa procedura in modalità live: prezzi Base/Pro
   veri, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` live, un nuovo
   endpoint webhook — nessuna scelta di disegno ancora da prendere, solo
   da rifare con le credenziali vere quando si è pronti a vendere
   davvero. In parallelo resta aperto l'invio reale della fatturazione
   elettronica (Fase 4): un account presso un provider SDI (Aruba o un
   altro), poi una nuova Edge Function che prende l'XML già generato e
   lo trasmette.
2. **Dominio per Resend**: l'azienda non possiede ancora un dominio
   proprio (serve per verificare la proprietà via record DNS — non è un
   limite aggirabile, vale per qualunque provider email serio). Una
   volta comprato uno (8-15€/anno, un `.it`/`.com` qualsiasi, non serve
   necessariamente un sito), si verifica su Resend (pannello →
   Domains) e si imposta `RESEND_FROM` di conseguenza: fino ad allora
   `send-email` resta in modalità sandbox, utilizzabile solo verso
   l'indirizzo del titolare dell'account Resend, non fornitori/clienti
   veri.
3. **Un'app vera**, non solo un sito ottimizzato per telefono: la
   versione web (questa) resta comunque utile e usabile nel frattempo —
   ma un'app installabile (iOS/Android) è un progetto a sé, da pianificare
   separatamente quando si arriva a quel punto.
