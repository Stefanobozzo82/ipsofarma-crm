# Test end-to-end nel browser di saas/web

Suite Playwright per il gestionale: copre i percorsi più importanti e più
fragili del prodotto — quelli dove sono già stati trovati bug reali passati
inosservati per mesi, prima che una sessione di collaudo manuale li
scoprisse. Lo scopo di questi test è non dover più ripetere quella scoperta
a mano.

È **complementare**, non alternativa, alla suite in `saas/tests/` (vedi
[`../README.md`](../README.md)): quella esegue funzioni e migration SQL
in locale, senza rete né browser (PGlite, DOM simulato); questa apre le
pagine vere in un Chromium vero e clicca come farebbe un utente. Coprono
strati diversi: un bug di layout su telefono o un pulsante che resta
disabilitato per sempre si vedono solo qui; una race condition SQL solo lì.

## Come si esegue

```
cd saas/tests/e2e
npm install
npx playwright test
```

Apre in automatico un server statico locale su `saas/web` (nessun bisogno
di avviarlo a mano — vedi `playwright.config.js`, sezione `webServer`) e
lancia tutti gli spec in `specs/`. Per vedere il browser mentre gira:
`npm run test:headed`. Per l'interfaccia interattiva di Playwright:
`npm run test:ui`.

## Un limite onesto: Supabase resta quello vero

Ogni pagina di `saas/web` ha l'indirizzo e la chiave Supabase scritti a
mano nel file (`SUPABASE_URL`/`SUPABASE_ANON_KEY`, uguali ovunque) — non
esiste oggi un modo per farle puntare a un'istanza diversa (locale, o un
progetto Supabase "di prova") senza modificare ogni singolo file HTML.
Finché resta così, questa suite non può fare altro che collegarsi allo
**stesso Supabase di produzione** usato dai clienti veri.

Non è pericoloso per i dati reali: ogni test crea la propria azienda
usa-e-getta (via `helpers/testCompany.js`, la stessa strada di
registrazione che farebbe un cliente vero) e non tocca mai nient'altro —
le policy di sicurezza del database (RLS) impediscono comunque a
un'azienda di vedere i dati di un'altra. Ma è più lento di un database
locale, dipende dalla rete, e lascia dietro di sé delle righe vuote (vedi
sotto) invece di sparire senza lasciare traccia.

**La correzione giusta**, se in futuro serve una suite più veloce/isolata,
è spostare `SUPABASE_URL`/`SUPABASE_ANON_KEY` in un unico punto
configurabile (non 30 copie identiche in altrettanti file HTML) e usare
`supabase start` (CLI + Docker) per un'istanza locale usa-e-getta ad ogni
esecuzione — le migration in `saas/supabase/migrations/` sono già pronte
per quello, non richiederebbe di riscriverle.

## Account di prova

La suite NON registra utenti: Supabase Auth manda un'email di conferma a
ogni registrazione e ne consente pochissime all'ora ("email rate limit
exceeded" già dalla prima, verificato sullo staging), e comunque rifiuta
gli indirizzi su domini inventati o riservati come `example.com`. Servono
quindi **due account già registrati e confermati** sul progetto di test,
creati una volta a mano dalla pagina di accesso (per Gmail bastano due
alias della propria casella, es. `mario+qa-admin@gmail.com` e
`mario+qa-operatore@gmail.com`: le email di conferma arrivano a
`mario@gmail.com`). Ogni test poi si limita a fare login e a creare la
propria azienda usa-e-getta con `register_company` — nessuna email.

```
E2E_EMAIL=mario+qa-admin@gmail.com E2E_PASSWORD=… \
E2E_OPERATOR_EMAIL=mario+qa-operatore@gmail.com E2E_OPERATOR_PASSWORD=… \
npx playwright test
```

Il secondo account serve solo a `permessi.spec.js` (un utente non admin
invitato nell'azienda del primo). Senza le variabili la suite si ferma
subito con un messaggio chiaro.

### Contro lo staging invece che contro la produzione

`saas/scripts/staging-preview.cjs` serve le stesse pagine riscrivendo
`SUPABASE_URL`/`SUPABASE_ANON_KEY` verso il progetto di staging
(`saas/staging.config.json`), sulla porta 8080. Con quello acceso:

```
TEST_BASE_URL=http://127.0.0.1:8080 E2E_EMAIL=… npx playwright test
```

Gli account di prova devono esistere sul progetto contro cui si gira.

## Pulizia dei dati di prova

Ogni test, alla fine, cancella tutto ciò che l'account admin dell'azienda
di prova PUÒ cancellare via RLS: documenti, clienti, fornitori, prodotti
(vedi `cleanupCompanyData` in `helpers/testCompany.js`). Quello che NON
può cancellare da solo è la riga dell'azienda e la sua "membership" —
richiede la `service_role key`, che questa suite non usa mai (per non
doverla tenere in giro in un file di configurazione).

Restano quindi, dopo ogni esecuzione, delle aziende vuote (nessun
documento, nessuna anagrafica — solo il guscio) con un nome che inizia
sempre per **"QA Test"**. Per spazzarle via periodicamente:

```
SUPABASE_SERVICE_ROLE_KEY=<la service_role key vera> SUPABASE_URL=https://<progetto>.supabase.co node cleanup-orphans.js
```

Gli account di prova (vedi sopra) non vengono toccati: sono creati a mano
una volta e riusati da ogni esecuzione.

Va lanciato a mano (o da una pipeline separata, mai dalla suite stessa),
di tanto in tanto. Riconosce le aziende di prova SOLO dal prefisso "QA
Test" nel nome e da un'età minima (default un'ora, per non incrociare un
test ancora in corso altrove) — non tocca mai altro. `--dry-run` mostra
cosa cancellerebbe senza cancellare nulla.

## Struttura

- `helpers/testCompany.js` — la fixture `company`: crea un'azienda di
  prova prima del test, la ripulisce dopo.
- `helpers/docHelpers.js` — interazioni ricorrenti sui form documento
  (scegliere un prodotto dal catalogo, gestire i dialog nativi
  `confirm()`/`alert()`).
- `specs/anagrafiche.spec.js` — clienti, fornitori, prodotti: crea,
  modifica, elimina.
- `specs/cascata.spec.js` — l'intera catena ordine cliente → ordine
  fornitore → DDT → fattura, con gli importi verificati ad ogni passo.
  Lo scenario che ha fatto scoprire per davvero il bug di
  `checkDocLimit()` (vedi il commento in testa al file).
- `specs/permessi.spec.js` — solo un admin può eliminare un documento, un
  operatore no (con l'errore chiaro, non un pulsante che sembra non fare
  nulla).
- `specs/dashboard.spec.js` — i totali riflettono i documenti reali, i
  pulsanti aprono l'anno giusto, la legenda del grafico nasconde/mostra
  le serie.
- `specs/mobile.spec.js` — nessuno scorrimento orizzontale a larghezza da
  telefono, "Esci" mai coperto dalla barra di navigazione in basso.
- `specs/lista-grandi.spec.js` — un elenco con più di 300 documenti
  disegna solo le prime 300 righe (con avviso), il fix di prestazioni
  nato dall'import storico Maestro Gold.

## Cosa NON copre ancora

Non è una suite esaustiva — copre i percorsi più a rischio trovati finora,
non ogni modulo del gestionale (preventivi, magazzino, riconciliazione
bancaria, l'assistente IA, l'import da PDF/foto, FatturaPA non sono
ancora testati). Va estesa mano a mano che si tocca quel codice, sullo
stesso modello di questi file.
