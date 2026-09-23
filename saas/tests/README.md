# Test end-to-end di saas/web

Suite Playwright per il gestionale: copre i percorsi più importanti e più
fragili del prodotto — quelli dove sono già stati trovati bug reali passati
inosservati per mesi, prima che una sessione di collaudo manuale li
scoprisse. Lo scopo di questi test è non dover più ripetere quella scoperta
a mano.

## Come si esegue

```
cd saas/tests
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

## Pulizia dei dati di prova

Ogni test, alla fine, cancella tutto ciò che l'account admin dell'azienda
di prova PUÒ cancellare via RLS: documenti, clienti, fornitori, prodotti
(vedi `cleanupCompanyData` in `helpers/testCompany.js`). Quello che NON
può cancellare da solo è la riga dell'azienda, la sua "membership" e
l'utente Supabase Auth creato per il test — richiede la `service_role
key`, che questa suite non usa mai (per non doverla tenere in giro in un
file di configurazione).

Restano quindi, dopo ogni esecuzione, delle aziende vuote (nessun
documento, nessuna anagrafica — solo il guscio) con un nome che inizia
sempre per **"QA Test"**. Per spazzarle via periodicamente:

```
SUPABASE_SERVICE_ROLE_KEY=<la service_role key vera> node cleanup-orphans.js
```

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
