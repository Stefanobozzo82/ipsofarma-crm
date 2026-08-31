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
│   ├── clienti.html                  anagrafica clienti
│   ├── preventivi.html               preventivi, trasformabili in ordine cliente
│   ├── ordini.html                   ordini cliente, con numerazione
│   ├── ddt.html                      DDT, collegato a un ordine (facoltativo)
│   ├── fatture.html                  fatture cliente, con stato di incasso
│   ├── note-credito.html             note di credito cliente
│   ├── fornitori.html                anagrafica fornitori
│   ├── ordini-fornitore.html         ordini fornitore, con numerazione
│   ├── fatture-fornitore.html        fatture fornitore, con stato di pagamento
│   ├── note-credito-fornitore.html   note di credito fornitore
│   ├── prodotti.html                 catalogo prodotti, con ricerca lato server
│   ├── abbonamento.html              piano attuale + cambio piano (Fase 5)
│   └── app/
│       ├── store.js                  adattatore di persistenza (sostituisce ghSave/ghLoad)
│       ├── theme.css                 sistema grafico condiviso (token colore, tipografia, componenti)
│       ├── nav.js                    sidebar di navigazione condivisa (sostituisce il menu orizzontale)
│       └── resize.js                 colonne ridimensionabili trascinando il bordo dell'intestazione
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
- **Chiamate Stripe reali mai collaudate**: l'account non esiste ancora (Fase 5) —
  la logica di `stripe-checkout`/`stripe-webhook` è corretta per costruzione,
  verificata dove possibile senza Stripe vero, ma non ancora con un pagamento reale.

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

**Cosa NON è stato possibile collaudare, onestamente**: nessuna chiamata
vera a Stripe (creazione cliente, sessione di pagamento, evento reale di
sottoscrizione) — serve l'account. La logica segue esattamente la
documentazione Stripe ed è corretta per costruzione, ma "corretto per
costruzione" non è lo stesso di "verificato" — da fare non appena
l'azienda ha le chiavi di test.

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
- [ ] Incassi / Pagamenti (storico)
- [ ] Scadenziario
- [ ] Impostazioni azienda
- [ ] Ricerca testuale negli elenchi documento
- [ ] Filtri elenco (fornitore/stato/intervallo date)
- [ ] Selezione multipla e azioni collettive
- [ ] Stampa/PDF di un documento
- [ ] Destinazioni multiple cliente
- [ ] Autocompletamento riga da catalogo prodotti
- [ ] Generazione/download XML FatturaPA da `fatture.html`
- [ ] Report & Analisi
- [ ] Assistente AI (interfaccia di chat)
- [ ] IA che crea documenti da un allegato (fattura/ordine/preventivo)

Non nella lista di proposito — non è "gestionale mancante", è
un'integrazione specifica del modo di lavorare di Ipsofarma da ripensare,
non semplicemente copiare, se e quando servirà a un cliente del SaaS:
l'import automatico ordini da Google Sheet e il monitoraggio Gmail per
nuove fatture fornitore.

## Prossimo passo

Due filoni distinti, entrambi rimandati per scelta esplicita
dell'azienda:

1. **Stripe/SDI**: creare un account Stripe (gratuito, modalità test,
   nessuna verifica aziendale richiesta — stesso percorso già fatto con
   Supabase), impostare `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` come
   secret e collaudare per davvero checkout e webhook. In parallelo resta
   aperto l'invio reale della fatturazione elettronica (Fase 4): un
   account presso un provider SDI (Aruba o un altro), poi una nuova Edge
   Function che prende l'XML già generato e lo trasmette.
2. **Un'app vera**, non solo un sito ottimizzato per telefono: la
   versione web (questa) resta comunque utile e usabile nel frattempo —
   ma un'app installabile (iOS/Android) è un progetto a sé, da pianificare
   separatamente quando si arriva a quel punto.
