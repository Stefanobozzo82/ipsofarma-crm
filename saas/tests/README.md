# Test di stabilizzazione

Requisito: Node.js 24 o superiore. Nessuna installazione npm, credenziale o rete richiesta.

Da `saas/`:

```sh
npm test
```

I test eseguono il codice effettivo con store, Supabase e provider simulati:

- `coverage.test.cjs`: copertura quantitativa ordini fornitore, residui, righe duplicate, più ordini e link legacy. Sulla baseline `7cc2b0e` 7 degli 11 test falliscono; con la correzione passano tutti.
- `cors.test.cjs`: allowlist esatta, origini opache/malevole, configurazione mancante, richieste senza Origin e isolamento degli header.
- `edge-cors.test.cjs`: handler IA e checkout, preflight, origini vietate e autenticazione ancora obbligatoria.
- `email*.test.cjs`: identità aziendale server-side, ruoli e contratto del client; vedere i nomi dei casi nel runner.

Il runner usa il supporto TypeScript di Node e, per caricare gli handler Deno con dipendenze simulate, `stripTypeScriptTypes`, che può emettere un avviso sperimentale. Non sostituisce `deno check`, il bundling Supabase o un collaudo su staging.

Questa suite non attesta ancora RLS, transazioni PostgreSQL, concorrenza, consegna email reale, pagamenti o flussi E2E. I criteri per estenderla sono in `../docs/STABILIZATION_AUDIT.md`. Non sono stati aggiunti workflow alla radice del repository: il perimetro autorizzato è `saas/`.
