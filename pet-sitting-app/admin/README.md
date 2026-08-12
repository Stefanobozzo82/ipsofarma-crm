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
│   └── env.ts
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
