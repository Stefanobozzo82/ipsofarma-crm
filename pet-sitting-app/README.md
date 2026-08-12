# Fido — pet-sitting marketplace (nome di lavoro)

Marketplace pet-sitting per il mercato italiano, lancio pilota a Cosenza/Calabria. Monorepo isolato dal resto del repository — vedi la nota nella root.

## Documentazione

- [`docs/PHASE1-PROPOSAL.md`](./docs/PHASE1-PROPOSAL.md) — schema database, struttura del progetto, API REST, roadmap

## Pacchetti

| Cartella | Stato | Descrizione |
|---|---|---|
| [`shared/`](./shared) | ✅ Fase 2 | Tipi, enum e schemi Zod condivisi tra backend/mobile/admin |
| [`backend/`](./backend) | ✅ Fase 2 | API Express: autenticazione, profili owner/sitter, animali, upload documenti |
| `mobile/` | 🔜 Fase 5-6 | App React Native (Expo) |
| `admin/` | 🔜 Fase 7 | Pannello web di amministrazione |

## Stack

React Native · Node/Express + TypeScript · Supabase (Postgres, Auth, Storage, Realtime, PostGIS) · Stripe Connect · Firebase Cloud Messaging

## Quick start

```bash
pnpm install
cp backend/.env.example backend/.env   # compila con le credenziali del tuo progetto Supabase
pnpm dev:backend
```

Dettagli su migrazioni, seed e test degli endpoint: [`backend/README.md`](./backend/README.md).
