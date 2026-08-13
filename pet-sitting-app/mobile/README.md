# mobile

App React Native (Expo + Expo Router) per Fido. Copre il percorso **proprietario** (login/registrazione, ricerca sitter, Meet & Greet, prenotazione, pagamento Stripe, gestione animali, candidatura come sitter) e la **dashboard sitter** (richieste in arrivo, calendario, guadagni/payout, listino servizi, disponibilità) — vedi [`docs/PHASE1-PROPOSAL.md`](../docs/PHASE1-PROPOSAL.md) per la roadmap completa.

## Setup

```bash
# dalla root di pet-sitting-app/, dopo aver avviato backend + Supabase (vedi backend/README.md)
pnpm install
cp mobile/.env.example mobile/.env
# compila EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY (stessi valori di backend/.env)
# EXPO_PUBLIC_API_URL: localhost per simulatore iOS/web, IP di rete locale per device fisico o emulatore Android
# EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: chiave pubblica pk_test_... dal dashboard Stripe

pnpm dev:mobile   # equivalente a: pnpm --filter mobile start
```

## Cosa funziona in Expo Go, cosa no

- **Expo Go**: auth, ricerca, profilo sitter, Meet & Greet, creazione prenotazione, gestione animali, candidatura sitter, selezione date (`@react-native-community/datetimepicker` è incluso in Expo Go).
- **Richiede una dev client build** (`npx expo run:ios` / `npx expo run:android` o `eas build --profile development`), non Expo Go: il pagamento in-app (`@stripe/stripe-react-native` include codice nativo non presente in Expo Go). Il resto dell'app resta testabile in Expo Go anche senza build nativa.

## Architettura

```
app/                    # Expo Router — un file = una rotta
├── _layout.tsx           # provider root (Stripe, safe area, gesture handler), init auth store
├── index.tsx               # redirect verso (auth) o (tabs) in base alla sessione
├── (auth)/                  # login, registrazione
├── (tabs)/                   # ricerca, prenotazioni, profilo — tab bar principale
├── sitter/[id].tsx            # profilo pubblico sitter + Meet & Greet + CTA prenota
├── booking/new.tsx             # form prenotazione (animali, date — varia per price_unit del servizio)
├── booking/[id].tsx             # dettaglio, riepilogo prezzo, pagamento (Stripe PaymentSheet), cancellazione
├── pets/index.tsx                 # lista + aggiunta animali
├── sitter-onboarding/apply.tsx     # candidatura come sitter
└── sitter-dashboard/                # raggiungibile da Profilo quando il sitter è approvato
    ├── index.tsx                      # statistiche, banner onboarding Stripe, link rapidi
    ├── requests.tsx                    # richieste in arrivo (accetta/rifiuta)
    ├── calendar.tsx                      # prenotazioni confermate/in corso/completate
    ├── payouts.tsx                        # saldo, storico, richiesta payout
    ├── services.tsx                        # listino servizi (upsert per tipo, rimozione)
    └── availability.tsx                     # disponibilità settimanale (1 fascia/giorno, MVP)

src/
├── lib/
│   ├── supabase.ts       # client Supabase (solo auth/sessione — vedi nota sotto)
│   ├── api.ts              # fetch verso il backend Express, allega il JWT, normalizza {data}/{error}
│   ├── location.ts          # geolocalizzazione con fallback su Cosenza
│   └── date.ts                # helper Date → "YYYY-MM-DD"/"HH:MM" senza bug di fuso orario
├── store/auth-store.ts    # Zustand: sessione, profilo (GET /users/me), signIn/signUp/signOut
├── features/*/api.ts       # wrapper tipizzati (@fido/shared) per ogni dominio: search, sitters, pets, bookings, meet-greets
├── components/               # Screen, Button, TextField, Card, StatusBadge, SitterCard, PetPicker...
├── theme/                      # palette (chiaro/scuro via useColorScheme), spacing, tipografia
└── i18n/strings.ts               # stringhe italiane centralizzate (nessuna libreria i18n per l'MVP)
```

**Perché due client diversi verso il backend**: l'auth (signUp/signIn/refresh) e la **chat** (`features/chat/api.ts`) passano direttamente dal client Supabase (`lib/supabase.ts`) — nessuna logica di business da applicare, solo RLS, quindi non serve passare dal backend Express. Tutto il resto (profili, ricerca, prenotazioni, pagamenti, recensioni) passa da `lib/api.ts`, che applica la logica scritta nelle Fasi 2-4/6.

La chat usa Supabase Realtime (`postgres_changes` su `messages`, vedi `supabase/migrations/20260812170000_chat.sql`): niente polling, i messaggi arrivano push-style anche per il mittente (l'invio non fa append ottimistico, aspetta l'evento realtime — una sola fonte di verità per messaggio).

## Semplificazioni della dashboard sitter (dichiarate, non bug)

- **Disponibilità**: una sola fascia oraria per giorno, valida per tutti i servizi. Il backend supporta fasce multiple e fasce per-servizio (`sitter_availability.service_type` nullable) — l'editor mobile no, per ora. Il salvataggio **non tocca le eccezioni** esistenti (giorni bloccati) anche se questa schermata non le mostra: vengono ricaricate e reinviate invariate, non sovrascritte.
- **Calendario sitter**: lista cronologica, non una vista a griglia mensile.
- Nessuna azione admin (approvazione candidature) da mobile — resta nel pannello `admin/` (Fase 7).

## Verificato in questa fase

`pnpm install`, `tsc --noEmit` puliti, e `npx expo config` risolto correttamente (ha anche fatto emergere un bug reale: il plugin `@stripe/stripe-react-native` richiede `merchantIdentifier` esplicito in `app.json`, altrimenti la build nativa fallisce — corretto). Non è stato possibile in questo ambiente headless avviare e ispezionare visivamente l'app su simulatore/device: fallo in locale con `pnpm dev:mobile` per il primo giro di QA manuale.

**Aggiornamento — bug reale trovato avviando davvero Metro** (non solo `expo config`, che non tocca il bundler): il primo bundle falliva ovunque, non solo su un target specifico, con `Unable to resolve module @babel/runtime/helpers/interopRequireDefault` — l'helper di interop CommonJS che Babel inietta in ogni file transpilato (qui capitato su `app/(auth)/login.tsx`, ma avrebbe colpito qualunque file). `@babel/runtime` non era mai stato un dependency diretto di questo package: vive nello store pnpm ma senza una dichiarazione esplicita in `package.json` non finisce symlinkato in `mobile/node_modules`, e Metro di default non segue comunque i symlink verso l'esterno del proprio `projectRoot`. Fix in due parti — `@babel/runtime` aggiunto alle dependencies, e `metro.config.js` con `unstable_enableSymlinks`/`watchFolders` per il resto del monorepo pnpm. Verificato richiedendo direttamente i bundle `platform=ios` e `platform=android` a Metro (gli stessi che scaricherebbe Expo Go su device reale): entrambi tornano `200` con un bundle completo, prima falliva identico su entrambe le piattaforme.

**Aggiornamento — SDK 52 → 54**: un utente che ha provato l'app in locale aveva Expo Go SDK 54 installato dallo store (che aggiorna sempre alla versione più recente) contro un progetto fermo a SDK 52 — incompatibili, l'app non si apriva. Aggiornato con `expo install expo@^54.0.0` + `expo install --fix` (allinea automaticamente tutte le dipendenze native alle versioni attese: React 18→19, React Native 0.76→0.81, expo-router 4→6, tra le altre). Nessuna rottura: `tsc --noEmit` pulito su tutti i package del monorepo, `npx expo config` risolve `sdkVersion: "54.0.0"`, e i bundle `platform=ios`/`platform=android` tornano di nuovo `200` da un vero Metro. `expo install --fix` ha anche registrato correttamente il config plugin di `@react-native-community/datetimepicker` in `app.json` (la nuova versione del pacchetto lo richiede) — non c'era prima, non è un refuso.

## Tracking GPS e aggiornamenti servizio

Su `booking/[id].tsx`, quando il sitter è nella prenotazione `in_progress`: `ServiceTrackingPanel` avvia/ferma il tracking GPS (solo per `dog_walking` — usa `expo-location` in foreground, un `watchPositionAsync` ogni ~10s/15m che manda un ping al backend, niente tracking in background) e invia aggiornamenti testuali, sempre disponibili per qualunque servizio. `ServiceUpdatesList` mostra lo storico a entrambe le parti. Niente mappa (richiederebbe una API key Google/Apple Maps che non c'è) — solo distanza finale e conteggio punti mentre è in corso.

## Cosa manca (prossime fasi)

- **Invio push reale**: il feed di notifiche in-app funziona già (`app/notifications/`), la registrazione del token è già collegata (`src/lib/push-notifications.ts`) — manca solo un progetto Firebase/EAS reale del cliente per completare la consegna (vedi `backend/src/lib/push.ts`)
- **Foto negli aggiornamenti di servizio**: il backend espone già l'URL di upload firmato, manca il picker lato mobile (`expo-image-picker` + upload + visualizzazione con URL firmati, dato che il bucket è privato)
- Mappa/percorso visuale del tracking GPS (richiede una API key Maps)
- Tracking GPS in background (oggi solo foreground — se l'app va in background durante la passeggiata, il tracking si ferma)
- Fasce di disponibilità multiple/per-servizio da mobile, gestione eccezioni (giorni bloccati) da UI
- i18n multilingua (oggi solo italiano, vedi `src/i18n/strings.ts`)
- Icone/splash screen personalizzati (oggi si usano i default Expo)
