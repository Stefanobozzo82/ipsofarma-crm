# Fido — pet-sitting marketplace (nome di lavoro)

Marketplace pet-sitting per il mercato italiano, lancio pilota a Cosenza/Calabria. Monorepo isolato dal resto del repository — vedi la nota nella root.

## Documentazione

- [`docs/PHASE1-PROPOSAL.md`](./docs/PHASE1-PROPOSAL.md) — schema database, struttura del progetto, API REST, roadmap

## Pacchetti

| Cartella | Stato | Descrizione |
|---|---|---|
| [`shared/`](./shared) | ✅ Fase 2-3 | Tipi, enum e schemi Zod condivisi tra backend/mobile/admin |
| [`backend/`](./backend) | ✅ Fase 2-3 | Autenticazione, profili owner/sitter, animali, upload documenti, listino servizi/disponibilità sitter, ricerca geografica |
| `mobile/` | 🔜 Fase 5-6 | App React Native (Expo) |
| `admin/` | 🔜 Fase 7 | Pannello web di amministrazione |

**Fase 3** (ricerca): tabelle `sitter_services`/`sitter_availability`/`availability_exceptions`, colonna `accepted_species` su `sitter_profiles`, funzione PostGIS `nearby_sitters()`, endpoint `PUT/GET /sitters/me/services`, `PUT/GET /sitters/me/availability`, `GET /search/sitters`.

## Stack

React Native · Node/Express + TypeScript · Supabase (Postgres, Auth, Storage, Realtime, PostGIS) · Stripe Connect · Firebase Cloud Messaging

## Quick start

```bash
pnpm install
cp backend/.env.example backend/.env   # compila con le credenziali del tuo progetto Supabase
pnpm dev:backend
```

Dettagli su migrazioni, seed e test degli endpoint: [`backend/README.md`](./backend/README.md).
