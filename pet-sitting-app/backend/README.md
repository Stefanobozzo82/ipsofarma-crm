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

## Notifiche

Feed in-app (`GET/PATCH /notifications`) pienamente funzionante — chiamato da `notifyUser()` (`modules/notifications/notification.service.ts`) su ogni evento rilevante: nuova richiesta, accept/decline/cancel, esito meet & greet, pagamento ricevuto, payout accreditato, esito candidatura sitter, risoluzione dispute, nuovo messaggio (quest'ultimo via trigger SQL, non da qui — la chat non passa da Express). **L'invio push reale** (Firebase/APNs) è uno stub in `lib/push.ts`: richiede un progetto Firebase del cliente, non esiste ancora in questo ambiente.

## Tracking GPS e aggiornamenti servizio

`gps_tracks` (un percorso per prenotazione, punti come array JSONB — non una tabella normalizzata, vedi `docs/PHASE1-PROPOSAL.md`) e `service_updates` (foto/note). Endpoint sotto `/bookings/:id/gps/*` e `/bookings/:id/updates*`, solo il sitter assegnato scrive. La distanza si calcola lato server allo `stop` (haversine sulla sequenza di punti), non ad ogni `ping`. Bucket Storage `service-photos` privato, scoped alla singola prenotazione (entrambe le parti leggono, solo il sitter scrive) — l'endpoint di upload firmato esiste, il picker lato mobile non è ancora collegato.

## Cosa manca (prossime fasi)

- Invio push reale (richiede credenziali Firebase del cliente)
- Picker foto lato mobile per gli aggiornamenti di servizio (il backend è pronto)
- Un secondo giro di controproposta sui meet & greet (per l'MVP: un solo giro owner→sitter→owner)

## Verificato con un Supabase vero, non solo mock

Le fasi 1-10 erano state validate solo con `tsc --noEmit` e smoke test contro
un `SUPABASE_URL` finto (verificava solo che le rotte protette rispondessero
401, mai una vera query autenticata). Il primo giro contro un'istanza
Supabase locale realmente in esecuzione (`supabase start`) ha fatto emergere
tre bug reali, tutti mascherati fino a quel momento:

1. **Nessuna migrazione concedeva GRANT a livello di tabella** ai ruoli
   `anon`/`authenticated`/`service_role`. La RLS filtra le righe, ma senza un
   `GRANT` esplicito Postgres nega l'operazione a monte con "permission
   denied for table" — succede in automatico solo creando tabelle dalla
   Table Editor di Supabase Studio, non scrivendo SQL a mano. Fix in
   `supabase/migrations/20260812200000_grants.sql`.
2. Conseguenza diretta del bug 1: gli upsert di `scripts/seed.ts` verso
   `supabaseAdmin` (service role — bypassa la RLS ma non i grant di tabella)
   fallivano silenziosamente perché il codice non controllava l'errore
   restituito. Il seed "riusciva" senza aver scritto
   `owner_profiles`/`sitter_profiles`/`sitter_services`/`sitter_availability`.
   Ora ogni upsert passa da un helper `must()` che fa fallire lo script sul
   primo errore reale.
3. `sitter_profiles` ha due FK verso `users` (`user_id` e `approved_by`):
   l'embed implicito `users(...)` in `sitters.service.ts`/`admin.service.ts`
   è ambiguo per PostgREST (`PGRST201`). Disambiguato con il nome esplicito
   del vincolo (`users!sitter_profiles_user_id_fkey`).

Con i fix, verificato manualmente l'intero flusso con dati reali: login,
`GET /users/me`, `/pets`, ricerca geografica (`nearby_sitters`), profilo
pubblico sitter, creazione/accettazione prenotazione con calcolo
prezzo/commissione lato server, completamento, recensione con aggregazione
automatica del rating, ed endpoint admin (stats, coda approvazione, approve).
Non testato in questo giro: pagamento Stripe reale (richiede chiavi test),
realtime/edge-runtime (esclusi dall'ambiente locale usato per il test — vedi
nota sotto), invio push.

**Nota sull'ambiente di test**: `supabase start --exclude realtime,edge-runtime`
— i container `realtime` ed `edge-runtime` non partono in alcuni ambienti
containerizzati per una restrizione OCI/runc del sandbox
(`error setting rlimits for ready process`), non un problema del progetto.
REST/Auth/Storage/DB funzionano regolarmente; solo le sottoscrizioni
Realtime via WebSocket (chat, GPS live) non sono testabili in quell'ambiente
specifico.

## Stripe: Accounts v2, non più v1

Punto B del piano di test: con una chiave test reale, la creazione
dell'account Connect del sitter falliva con *"Stripe no longer recommends
Accounts v1 for new Connect integrations"* — gli account Stripe creati di
recente rifiutano di default `stripe.accounts.create()` (v1) e richiedono
`stripe.v2.core.accounts.create()`. Migrato **solo** questo punto:

- `stripe` alzato da `^17.4.0` a `^22.5.0` (l'SDK v17 non espone affatto
  `stripe.v2.core.*` — serve una versione molto più recente).
- `getOrCreateConnectAccountId()` (`stripe-connect.service.ts`) ora crea
  l'account con `stripe.v2.core.accounts.create()`, configurazione
  `recipient` (non `merchant`: il sitter non è mai il merchant of record,
  non impostiamo `on_behalf_of` — è esattamente il caso d'uso che Stripe
  documenta per `recipient`), `dashboard: "express"` con
  `fees_collector`/`losses_collector` entrambi `"application"` (unica
  combinazione valida per `dashboard: "express"`, confermata dai codici di
  errore dell'API Stripe stessa).
- **Tutto il resto resta v1** senza modifiche: `accountLinks.create()`
  (onboarding), `paymentIntents.create()` con `transfer_data.destination`,
  `balance.retrieve()`, `payouts.create()`, il webhook — Stripe rende gli
  id degli account v2 interoperabili con questi endpoint v1 invariati, vedi
  [docs.stripe.com/connect/accounts-v2](https://docs.stripe.com/connect/accounts-v2).
- Il bump di `stripe` ha reso più stretto il tipo di `balance.retrieve()`:
  `{ stripeAccount: ... }` andava passato come secondo argomento (opzioni),
  non nel primo (parametri) — un bug latente mai eseguito dal vivo prima
  d'ora, corretto in entrambi i punti che lo chiamano.

Verificato dal vivo contro Stripe test mode: onboarding-link risponde `200`
con un vero URL `connect.stripe.com/setup/...`, l'account compare su Stripe
(`GET /v2/core/accounts/:id` → `applied_configurations: ["recipient"]`,
`dashboard: "express"`) ed è persistito in `sitter_payment_accounts`. Non
completato in questo giro: l'onboarding KYC vero richiede di aprire l'URL in
un browser e inserire dati d'identità — non simulabile qui — quindi
`POST /bookings/:id/pay` resta bloccato con l'errore atteso
`sitter_stripe_not_ready` finché non lo si completa manualmente.

## Bug reale: il backend non era mai stato distribuibile in produzione

Scoperto preparando un vero deploy (Render) per far testare l'app a un
utente senza tenere il PC acceso — `pnpm build` non era mai stato eseguito
sul serio prima d'ora, `dev` ha sempre usato `tsx watch` che compila
TypeScript al volo e non ne ha mai esposto i problemi. Due bug, entrambi
avrebbero fatto crashare qualunque deploy reale al primo avvio:

1. `tsconfig.json` ha `rootDir: "."` con `include: ["src", "scripts"]`: `tsc`
   preserva quei due prefissi nell'output, quindi il file emesso finiva in
   `dist/src/server.js`, non `dist/server.js` come si aspettava
   `package.json` (`main`/`start`).
2. Anche corretto il percorso, `node dist/src/server.js` puro falliva
   comunque con `ERR_UNSUPPORTED_DIR_IMPORT` su `@fido/shared`: il pacchetto
   condiviso ha `"main": "src/index.ts"` (sorgente TypeScript grezza, mai
   compilata) — Metro e Vite (mobile/admin) lo gestiscono con la propria
   pipeline di transform, ma Node puro no, e `tsc` non lo ricompila perché
   vive fuori dal `rootDir` di backend.

Fix pragmatico: `start` ora usa `tsx src/server.ts` invece di
`node dist/server.js` — lo stesso identico meccanismo già testato in `dev`,
solo senza `--watch`. `tsx` spostato da devDependencies a dependencies
(serve a runtime, non solo in sviluppo). `build` è rimasto come gate di
typecheck pre-deploy (`tsc --noEmit`), ma il suo output non viene più usato
per avviare il server. Verificato lanciando `pnpm build && pnpm start` da
zero e interrogando `/health`.

**Aggiornamento — due bug in più, scoperti da un deploy reale su Render.dev**:

1. **`NODE_ENV=production` fa saltare tutte le devDependencies durante
   `pnpm install`** (comportamento normale di pnpm/npm, non un bug loro) —
   incluse `typescript` e le `@types/*`, necessarie al gate di typecheck
   (`pnpm build`). Mai visto prima perché in locale/dev non si imposta mai
   `NODE_ENV=production` prima di installare. Fix: spostate da
   `devDependencies` a `dependencies` in questo package — semanticamente
   un po' insolito (sono pacchetti "da build", non da runtime — `tsx` non
   ne ha bisogno per girare), ma è il modo standard di far funzionare un
   gate di typecheck su una piattaforma che salta le devDependencies in
   produzione.
2. **`tsconfig.base.json` aveva `moduleResolution: "Node"`** (il nome
   legacy) — la versione di TypeScript risolta sull'ambiente di build di
   Render è abbastanza recente da aver rimosso il supporto (`TS5108: has
   been removed`), mentre in locale con una versione leggermente più
   vecchia era solo deprecato. Corretto al nome moderno `"node10"`
   (stesso comportamento, non deprecato) — e già che c'eravamo, la
   versione di `typescript` è stata fissata a `5.9.3` **esatta** (non più
   `^5.7.2`) in tutti e quattro i package del monorepo, per evitare che
   ambienti diversi risolvano patch diverse con comportamenti diversi su
   opzioni deprecate.

Verificato non solo in locale ma simulando l'esatto scenario di Render:
`rm -rf` di tutti i `node_modules`, poi `NODE_ENV=production pnpm install`
+ `pnpm --filter backend build` da zero — puliti entrambi.
