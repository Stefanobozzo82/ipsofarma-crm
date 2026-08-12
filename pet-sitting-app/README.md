# Fido — pet-sitting marketplace (nome di lavoro)

Marketplace pet-sitting per il mercato italiano, lancio pilota a Cosenza/Calabria. Monorepo isolato dal resto del repository — vedi la nota nella root.

## Documentazione

- [`docs/PHASE1-PROPOSAL.md`](./docs/PHASE1-PROPOSAL.md) — schema database, struttura del progetto, API REST, roadmap

## Pacchetti

| Cartella | Stato | Descrizione |
|---|---|---|
| [`shared/`](./shared) | ✅ Fase 2-4 | Tipi, enum e schemi Zod condivisi tra backend/mobile/admin |
| [`backend/`](./backend) | ✅ Fase 2-4 | Autenticazione, profili, ricerca geografica, prenotazioni, Stripe Connect |
| `mobile/` | 🔜 Fase 5-6 | App React Native (Expo) |
| `admin/` | 🔜 Fase 7 | Pannello web di amministrazione |

**Fase 3** (ricerca): tabelle `sitter_services`/`sitter_availability`/`availability_exceptions`, colonna `accepted_species` su `sitter_profiles`, funzione PostGIS `nearby_sitters()`, endpoint `PUT/GET /sitters/me/services`, `PUT/GET /sitters/me/availability`, `GET /search/sitters`.

**Fase 4** (prenotazioni e pagamenti): tabelle `bookings`/`booking_pets`/`meet_greet_requests`/`payments`/`payouts`/`sitter_payment_accounts`, commissione 18% trattenuta solo dal payout del sitter, Stripe Connect Express (onboarding, PaymentIntent con split, refund su cancellazione secondo policy, payout su richiesta), webhook Stripe. Include anche un fix di sicurezza alla RLS di `sitter_profiles` introdotta in Fase 2 (i dati Stripe non potevano restare lì, vedi `backend/README.md`).

## Stack

React Native · Node/Express + TypeScript · Supabase (Postgres, Auth, Storage, Realtime, PostGIS) · Stripe Connect · Firebase Cloud Messaging

## Quick start

```bash
pnpm install
cp backend/.env.example backend/.env   # compila con le credenziali del tuo progetto Supabase
pnpm dev:backend
```

Dettagli su migrazioni, seed e test degli endpoint: [`backend/README.md`](./backend/README.md).
