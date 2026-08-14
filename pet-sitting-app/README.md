# Fido — pet-sitting marketplace (nome di lavoro)

Marketplace pet-sitting per il mercato italiano, lancio pilota a Cosenza/Calabria. Monorepo isolato dal resto del repository — vedi la nota nella root.

## Documentazione

- [`docs/PHASE1-PROPOSAL.md`](./docs/PHASE1-PROPOSAL.md) — schema database, struttura del progetto, API REST originali
- [`backend/README.md`](./backend/README.md) — setup, migrazioni, endpoint, come girano auth/pagamenti/notifiche/tracking
- [`mobile/README.md`](./mobile/README.md) — setup, architettura, semplificazioni dichiarate
- [`admin/README.md`](./admin/README.md) — setup, come promuovere un utente ad admin
- [`web/README.md`](./web/README.md) — setup, struttura sezioni, decisioni di branding

## Pacchetti

| Cartella | Descrizione |
|---|---|
| [`shared/`](./shared) | Tipi, enum e schemi Zod condivisi tra backend/mobile/admin — unica fonte di verità per le forme dei dati |
| [`backend/`](./backend) | API Express: auth, profili, ricerca geografica, prenotazioni, Stripe Connect, recensioni, chat (schema/RLS), notifiche, tracking GPS, admin |
| [`mobile/`](./mobile) | App React Native (Expo): percorso proprietario e dashboard sitter, entrambi completi end-to-end |
| [`admin/`](./admin) | Pannello web (React + Vite): approvazione sitter, moderazione recensioni, dispute, statistiche |
| [`web/`](./web) | Sito marketing pubblico (React + Vite + Tailwind): homepage + ricerca sitter collegata al backend, scheda pubblica sitter, messaggistica realtime e prenotazione/pagamento |

## Cosa copre l'MVP, in breve

- **Autenticazione**: email/password + Google/Apple Sign-In via Supabase Auth, RLS ovunque
- **Profili**: proprietario, sitter (con accettazione selettiva), animali, verifica documenti
- **Ricerca**: geografica via PostGIS, filtri servizio/specie/prezzo/valutazione/disponibilità
- **Prenotazioni**: calcolo prezzo lato server, ciclo di vita completo (richiesta → confermata → in corso → completata), meet & greet, cancellazione con rimborso secondo policy
- **Pagamenti**: Stripe Connect Express, commissione 18% trattenuta solo dal payout del sitter (il proprietario paga il prezzo esatto mostrato, nessuna fee aggiuntiva), payout su richiesta
- **Recensioni**: bidirezionali, aggregate automaticamente sul profilo pubblico del sitter
- **Chat**: realtime via Supabase (non passa dal backend Express — vedi sotto)
- **Notifiche**: feed in-app completo; invio push reale in attesa di credenziali Firebase del cliente
- **Tracking GPS**: passeggiate, aggiornamenti testuali durante il servizio; foto lato backend pronte, picker mobile non ancora collegato
- **Admin**: coda approvazione sitter, moderazione recensioni, gestione dispute, statistiche piattaforma

## Due decisioni architetturali che vale la pena conoscere

**Due modi di parlare col backend.** La maggior parte dei dati passa dal backend Express (`lib/api.ts` lato mobile/admin), che applica RLS via client scoped all'utente e la logica di business (prezzi, Stripe). Auth e **chat** invece parlano direttamente con Supabase (client + Realtime): non c'è logica di business da applicare, la RLS basta. Vedi la nota in `backend/src/modules/auth/auth.service.ts` e `mobile/src/features/chat/api.ts`.

**Un fix di sicurezza fatto durante il percorso, non dopo.** La policy di lettura pubblica su `sitter_profiles` (Fase 2, necessaria per mostrare bio/rating in ricerca) esponeva l'intera riga — la RLS di Postgres filtra le righe, non le colonne. Quando in Fase 4 è stato il momento di aggiungere `stripe_account_id`, quel campo sarebbe finito nella stessa esposizione pubblica. Isolato in una tabella separata (`sitter_payment_accounts`) prima di procedere, non dopo — vedi `backend/README.md`.

## Cosa richiede credenziali/asset esterni per essere completato

Codice pronto, in attesa solo di credenziali reali del cliente:

| Cosa | Dove | Serve |
|---|---|---|
| Invio push reale | `backend/src/lib/push.ts` | Progetto Firebase (FCM/APNs) |
| Foto negli aggiornamenti di servizio | `mobile` | Picker immagine + upload (backend già pronto) |
| Mappa/percorso del tracking GPS | `mobile` | API key Google/Apple Maps |
| Build native (pagamento in-app, notifiche) | `mobile` | Dev client build (`eas build`), non funziona in Expo Go |
| Icone/splash personalizzati | `mobile/app.json` | Asset di brand reali |

## Stack

React Native (Expo) · Node/Express + TypeScript · Supabase (Postgres, Auth, Storage, Realtime, PostGIS) · Stripe Connect · React + Vite (admin, web) · Tailwind CSS (web) · Firebase Cloud Messaging (in attesa di credenziali)

## Quick start

```bash
pnpm install

# backend — richiede un progetto Supabase (locale via `supabase start` o hosted)
cp backend/.env.example backend/.env
pnpm dev:backend
pnpm seed:backend   # owner + sitter approvato + sitter in coda + admin demo

# mobile
cp mobile/.env.example mobile/.env
pnpm dev:mobile

# admin
cp admin/.env.example admin/.env
pnpm dev:admin
```

Ogni pacchetto ha il proprio README con i dettagli — vedi sopra.

## Verifica in questa serie di sessioni

Ad ogni fase: `pnpm install`, `tsc --noEmit` su tutti i workspace toccati, smoke test a runtime delle nuove rotte backend (401 su rotte protette, gestione errori pulita), `npx expo config` per il mobile (ha trovato e fatto correggere un bug reale di configurazione Stripe) e `vite build` per l'admin (build di produzione completata con successo). Non è stato possibile, in questo ambiente headless, avviare l'app mobile su un simulatore/device reale per un QA visivo — da fare in locale con `pnpm dev:mobile` prima del primo test con utenti veri.
