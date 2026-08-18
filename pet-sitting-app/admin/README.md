# admin

Pannello di amministrazione web (React + Vite) per Fido. Copre le operazioni che richiedono un umano: approvazione candidature sitter, moderazione recensioni, gestione dispute, statistiche piattaforma — vedi [`docs/PHASE1-PROPOSAL.md`](../docs/PHASE1-PROPOSAL.md).

## Setup

```bash
# dalla root di pet-sitting-app/, dopo aver avviato backend + Supabase (vedi backend/README.md)
pnpm install
cp admin/.env.example admin/.env
# compila con lo stesso progetto Supabase di backend/.env

pnpm dev:admin   # http://localhost:5174
```

## Deploy

Non ancora pubblicato online di default — a differenza di `backend/` e `web/`, gira solo in locale finché non si crea un servizio Render dedicato. Stesso procedimento già usato per `web/` (vedi `web/README.md`):

1. Su Render: **New → Static Site**, stesso account/repo GitHub già collegato per backend/web.
2. **Root Directory**: `pet-sitting-app`
3. **Build Command**: `npx pnpm@9.7.0 install && npx pnpm@9.7.0 --filter admin build` (lo stesso accorgimento `npx pnpm@9.7.0` invece di corepack, scoperto per il backend — evita l'errore EROFS di Render)
4. **Publish Directory**: `admin/dist`
5. **Rewrite rule**: sorgente `/*`, destinazione `/index.html`, tipo **Rewrite** — necessaria perché le rotte (`/sitters`, `/reviews`, `/disputes`) esistono solo lato client (React Router): senza questa regola, i link interni funzionano ma **aprire uno di questi indirizzi direttamente o aggiornare la pagina dà 404**.
6. **Variabili d'ambiente** del servizio (Environment): `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — stessi valori già presenti nel servizio backend, copiabili da lì. `VITE_API_URL` non è obbligatoria: ha un fallback al backend già deployato (vedi `src/lib/env.ts`), impostala solo se il pannello deve puntare a un backend diverso.
7. **Dopo il primo deploy**, aggiungi il dominio assegnato da Render (es. `https://fido-admin-xxxx.onrender.com`) alla lista `CORS_ORIGIN` del servizio **backend** su Render (variabile separata da virgole, vedi `backend/.env.example`) — senza, il browser blocca le risposte del backend anche se il pannello si carica.

## Promuovere un utente ad admin

Non esiste un endpoint per farlo (di proposito: è un'operazione privilegiata rara, non va esposta via API). Due strade:

```bash
# 1. Se hai già seedato (pnpm seed:backend), l'account demo è pronto:
#    admin-demo@fido.local / FidoDemo123!

# 2. Per promuovere un utente reale, via SQL diretto su Supabase
#    (dashboard → SQL editor, o supabase CLI):
update public.users set role = 'admin' where email = 'la-tua-email@esempio.it';
```

L'utente deve poi disconnettersi e riaccedere (o semplicemente ricaricare il pannello) perché il frontend rilegga `GET /users/me` e veda `role = 'admin'`.

## Architettura

```
src/
├── lib/
│   ├── supabase.ts    # client Supabase, solo auth (stesso pattern del mobile)
│   ├── api.ts           # fetch verso il backend Express, allega il JWT
│   └── env.ts            # VITE_API_URL ha un fallback al backend deployato — vedi sezione Deploy
├── store/auth-store.ts   # sessione + profilo; status 'forbidden' se role != 'admin'
├── components/
│   ├── Layout.tsx          # sidebar di navigazione
│   └── Badge.tsx             # stesso vocabolario di colore del mobile (StatusBadge)
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx      # statistiche piattaforma (GET /admin/stats)
│   ├── SittersPage.tsx         # coda approvazione candidature
│   ├── ReviewsPage.tsx          # moderazione (nascondi/ripristina)
│   └── DisputesPage.tsx          # gestione e risoluzione dispute
├── App.tsx                # routing, gate su status auth
└── styles.css               # stessa palette di mobile/src/theme/colors.ts, solo prefers-color-scheme
```

Tutte le rotte `/admin/*` del backend richiedono `role = 'admin'` (middleware `requireAdmin`) — il frontend non è l'unica barriera, è solo la UI sopra un controllo già applicato lato server.

## Cosa manca

- Dettaglio prenotazione dentro una dispute (oggi solo l'id troncato — servirebbe un `GET /admin/bookings/:id` per mostrare il contesto completo)
- Ricerca/filtri sulle tabelle (recensioni, dispute) — oggi liste semplici, max 200 righe
- Log delle azioni admin (`admin_action_logs` esiste ed è popolato, ma non c'è ancora una pagina per consultarlo)
- Gestione utenti generica (sospensione account, reset) — oggi solo il flusso sitter

## Verificato in questa fase

`pnpm install`, `tsc --noEmit` pulito, **build di produzione** (`vite build`) completata con successo, e dev server testato servendo l'HTML corretto — verifica più concreta del solo typecheck, dato che esercita davvero il bundler.

**Aggiornamento — QA visivo reale, non solo build**: punto D del piano di test end-to-end. Configurato `admin/.env` contro lo stesso Supabase locale di backend/mobile, avviato `vite dev` e guidato un browser reale (Chromium via Playwright) attraverso login con l'account `admin-demo` seedato, dashboard, e tutte le pagine di navigazione (candidature sitter, recensioni, dispute). Zero errori console/4xx/5xx in tutto il giro; dati mostrati coerenti con lo stato reale del database (recensione creata durante il test booking visibile e moderabile, coda candidature vuota dopo l'approvazione fatta in precedenza). Ha anche richiesto un fix concreto: `CORS_ORIGIN` sul backend era una singola origin fissa — mobile (porta 8081) e admin (porta 5173) non potevano girare insieme contro lo stesso backend in sviluppo; ora accetta una lista separata da virgole (vedi `backend/src/app.ts`).
