# backend

API Express per Fido. Copre autenticazione, profili (owner, sitter, animali), listino servizi/disponibilità sitter, ricerca geografica, prenotazioni, pagamenti (Stripe Connect) e recensioni — vedi [`docs/PHASE1-PROPOSAL.md`](../docs/PHASE1-PROPOSAL.md) per lo schema completo e la roadmap.

**Commissione**: il proprietario paga esattamente il prezzo mostrato dal sitter, nessuna fee aggiuntiva in checkout. La piattaforma trattiene il 18% dal payout del sitter (`shared/src/constants/platform.ts`).

## Prerequisiti

- Node.js ≥ 20, pnpm ≥ 9
- Un progetto Supabase — locale via [Supabase CLI](https://supabase.com/docs/guides/local-development) (`supabase start`) oppure un progetto hosted di sviluppo

## Setup

```bash
# dalla root di pet-sitting-app/
pnpm install

cp backend/.env.example backend/.env
# compila SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# (Project Settings → API sul dashboard Supabase, o l'output di `supabase start` in locale)
```

## Migrazioni database

```bash
cd backend
supabase link --project-ref <tuo-project-ref>   # solo per un progetto hosted
supabase db push                                 # applica le migrazioni in supabase/migrations
```

In locale, `supabase start` applica automaticamente le migrazioni presenti in `supabase/migrations` all'avvio.

## Sviluppo

```bash
pnpm dev:backend          # dalla root di pet-sitting-app/, avvia con reload su :4000
pnpm seed:backend         # crea un owner e un sitter demo già approvato (vedi scripts/seed.ts)
```

Verifica rapida:

```bash
curl http://localhost:4000/health
# {"status":"ok","service":"fido-backend"}
```

## Prova i flussi auth + profilo

```bash
# Registrazione
curl -X POST http://localhost:4000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Anna","lastName":"Verdi","gdprConsent":true}'

# Login → prendi access_token dalla risposta
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Profilo (sostituisci <ACCESS_TOKEN>)
curl http://localhost:4000/api/v1/users/me -H "Authorization: Bearer <ACCESS_TOKEN>"

# Aggiungi un animale
curl -X POST http://localhost:4000/api/v1/pets \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"Fido","species":"dog","behavioralNotes":"Molto giocoso"}'

# Candidati come sitter
curl -X POST http://localhost:4000/api/v1/sitters/apply \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"bio":"Amo gli animali, esperienza pluriennale con cani di ogni taglia","experienceYears":3,"address":"Via Test 1, Cosenza","latitude":39.30,"longitude":16.25,"serviceRadiusKm":10}'
```

Nota: `POST /sitters/apply` crea il profilo con `status = 'pending'` — non compare in ricerca finché non lo approvi manualmente in Supabase (`update sitter_profiles set status = 'approved' where user_id = '<id>'`) o non usi `pnpm seed:backend`, che crea già un sitter approvato.

## Prova servizi, disponibilità e ricerca (Fase 3)

```bash
# Imposta il listino (sostituisce l'intero set esistente)
curl -X PUT http://localhost:4000/api/v1/sitters/me/services \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '[{"serviceType":"dog_walking","price":15,"priceUnit":"per_walk","durationMinutes":30,"maxPets":2}]'

# Imposta disponibilità settimanale (lun-ven 9-13, dow: 0=domenica...6=sabato) + un'eccezione
curl -X PUT http://localhost:4000/api/v1/sitters/me/availability \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"slots":[{"dayOfWeek":1,"startTime":"09:00","endTime":"13:00"}],"exceptions":[{"date":"2026-08-20","isAvailable":false,"note":"Ferie"}]}'

# Ricerca per raggio — nessuna auth richiesta (richiede un sitter approvato con servizi attivi, es. quello creato da pnpm seed:backend)
curl "http://localhost:4000/api/v1/search/sitters?lat=39.30&lng=16.25&service=dog_walking&radiusKm=15"

# Profilo pubblico, ora include il listino
curl http://localhost:4000/api/v1/sitters/<SITTER_ID>/public
```

## Prova prenotazioni e pagamenti (Fase 4)

Richiede `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` compilati in `.env` (chiavi di test) e un sitter con onboarding Stripe completato — senza queste variabili le rotte sotto rispondono `503 stripe_not_configured` invece di rompere il resto dell'API.

```bash
# Il sitter avvia l'onboarding Stripe Connect Express
curl -X POST http://localhost:4000/api/v1/sitters/me/stripe/onboarding-link \
  -H "Authorization: Bearer <SITTER_ACCESS_TOKEN>"
# → { data: { url } } — apri l'URL nel browser, completa il flusso Stripe di test

# L'owner crea una richiesta di prenotazione
curl -X POST http://localhost:4000/api/v1/bookings \
  -H "Authorization: Bearer <OWNER_ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"sitterId":"<SITTER_ID>","serviceType":"dog_walking","petIds":["<PET_ID>"],"startDate":"2026-09-01"}'

# Il sitter accetta → status passa a "confirmed"
curl -X PATCH http://localhost:4000/api/v1/bookings/<BOOKING_ID>/accept \
  -H "Authorization: Bearer <SITTER_ACCESS_TOKEN>"

# L'owner avvia il pagamento → crea il PaymentIntent, restituisce il client secret
# da confermare lato client con Stripe SDK (PaymentSheet su mobile, Fase 5/6)
curl -X POST http://localhost:4000/api/v1/bookings/<BOOKING_ID>/pay \
  -H "Authorization: Bearer <OWNER_ACCESS_TOKEN>"

# Test webhook locale: usa la Stripe CLI (stripe listen --forward-to localhost:4000/api/v1/webhooks/stripe)
```

Meet & Greet:

```bash
curl -X POST http://localhost:4000/api/v1/meet-greets \
  -H "Authorization: Bearer <OWNER_ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"sitterId":"<SITTER_ID>","proposedDatetime":"2026-08-25T17:00:00Z"}'

curl -X PATCH http://localhost:4000/api/v1/meet-greets/<ID> \
  -H "Authorization: Bearer <SITTER_ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"action":"accept"}'
```

## Struttura

```
src/
├── config/env.ts        # variabili d'ambiente validate con Zod, fail-fast se mancanti
├── lib/
│   ├── supabase.ts       # supabaseAdmin (service role) / supabaseAnon / createUserScopedClient
│   ├── app-error.ts       # errore applicativo con status code esplicito
│   └── logger.ts
├── middleware/
│   ├── auth.ts            # requireAuth, requireAdmin — verificano il JWT Supabase
│   ├── validate.ts         # validateBody(zodSchema)
│   └── error-handler.ts     # notFound + errorHandler centralizzati
├── modules/
│   ├── auth/               # signup, login, refresh, scambio OAuth (Google/Apple ID token)
│   ├── users/               # GET/PATCH /users/me
│   ├── pets/                 # CRUD animali (soft delete)
│   ├── sitters/                # candidatura, profilo, listino servizi, disponibilità, upload documenti, pagina pubblica, onboarding Stripe, payout
│   ├── search/                  # GET /search/sitters — ricerca geografica via RPC nearby_sitters()
│   ├── bookings/                 # prenotazioni + meet & greet: calcolo prezzo, accept/decline/cancel, PaymentIntent
│   ├── stripe-connect/            # account Connect Express, payout su richiesta (usato da sitters.routes)
│   └── webhooks/                   # eventi Stripe (pagamento, onboarding account, payout)
├── routes/index.ts          # monta i moduli sotto /api/v1
├── app.ts                    # factory Express (middleware, rotte, error handling)
└── server.ts                  # entrypoint — avvia il listener
```

## Perché un client Supabase "scoped" per richiesta

Ogni handler autenticato riceve `req.supabase`, un client Supabase creato con il JWT dell'utente (non con la service role key). Le query eseguite con questo client passano dalla Row Level Security come se le facesse l'utente stesso — è la stessa garanzia di sicurezza che avrebbe una query fatta direttamente dal client mobile, senza dover reimplementare i controlli di ownership in ogni handler. `supabaseAdmin` (service role, bypassa RLS) va riservato a operazioni davvero privilegiate: al momento solo `scripts/seed.ts` e la generazione di URL di upload firmati lo usano indirettamente tramite `req.supabase`, che comunque rispetta le policy Storage.

## Modello di prenotazione e pagamento

`accept` (decisione del sitter) e `pay` (azione del proprietario) sono due passi separati — non un'unica chiamata: evita che dati di pagamento (client secret) finiscano nella risposta della chiamata del sitter, e rende `pay` idempotente su retry di rete lato client (idempotency key = booking id).

Cancellazione: se cancella il **sitter**, rimborso sempre pieno (la policy tutela il sitter dalle disdette tardive dell'owner, non il contrario). Se cancella l'**owner**, si applica il preset di cancellazione del sitter al momento della prenotazione (`shared/src/constants/cancellation.ts`).

Dati Stripe sensibili (`stripe_account_id`) vivono in `sitter_payment_accounts`, tabella separata da `sitter_profiles` — quest'ultima ha una lettura pubblica per i sitter approvati, e la RLS di Postgres filtra le righe non le colonne (vedi commento nella migrazione `20260812135000_*`).

## Booking → recensione

`PATCH /bookings/:id/start` e `/complete` (solo sitter) portano la prenotazione a `completed`; solo allora `POST /bookings/:id/reviews` accetta una recensione (una per direzione: owner→sitter e sitter→owner, vincolo `unique(booking_id, direction)`). Le recensioni owner→sitter aggiornano `sitter_profiles.average_rating`/`review_count` via trigger e sono pubbliche (`GET /sitters/:id/reviews`); quelle sitter→owner restano private (nessun profilo pubblico proprietario ancora).

## Admin

`/admin/*` (stats, coda approvazione sitter, moderazione recensioni, gestione dispute) richiede `role = 'admin'` su `public.users` — vedi [`../admin/README.md`](../admin/README.md) per come promuovere un utente e per il pannello web che consuma questi endpoint. `POST /bookings/:id/disputes` è invece lato utente: un partecipante alla prenotazione può aprire una contestazione, che porta `bookings.status` a `disputed` e da lì la gestisce solo un admin.

## Cosa manca (prossime fasi)

- GPS tracking passeggiate, foto/note durante il servizio — in corso
- Chat (`conversations`/`messages`), notifiche push — in corso
- Un secondo giro di controproposta sui meet & greet (per l'MVP: un solo giro owner→sitter→owner)
