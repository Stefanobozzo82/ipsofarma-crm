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

**Perché due client diversi verso il backend**: l'auth (signUp/signIn/refresh) passa direttamente dal client Supabase (`lib/supabase.ts`) — pattern raccomandato per app mobile, gestisce da solo il refresh dei token. Tutto il resto (profili, ricerca, prenotazioni, pagamenti) passa dal backend Express (`lib/api.ts`), che applica RLS via client scoped e la logica di business già scritta nelle Fasi 2-4.

## Semplificazioni della dashboard sitter (dichiarate, non bug)

- **Disponibilità**: una sola fascia oraria per giorno, valida per tutti i servizi. Il backend supporta fasce multiple e fasce per-servizio (`sitter_availability.service_type` nullable) — l'editor mobile no, per ora. Il salvataggio **non tocca le eccezioni** esistenti (giorni bloccati) anche se questa schermata non le mostra: vengono ricaricate e reinviate invariate, non sovrascritte.
- **Calendario sitter**: lista cronologica, non una vista a griglia mensile.
- Nessuna azione admin (approvazione candidature) da mobile — resta nel pannello `admin/` (Fase 7).

## Verificato in questa fase

`pnpm install`, `tsc --noEmit` puliti, e `npx expo config` risolto correttamente (ha anche fatto emergere un bug reale: il plugin `@stripe/stripe-react-native` richiede `merchantIdentifier` esplicito in `app.json`, altrimenti la build nativa fallisce — corretto). Non è stato possibile in questo ambiente headless avviare e ispezionare visivamente l'app su simulatore/device: fallo in locale con `pnpm dev:mobile` per il primo giro di QA manuale.

## Cosa manca (prossime fasi)

- Chat in-app, notifiche push (Firebase Cloud Messaging)
- Tracking GPS passeggiate, foto/note durante il servizio
- Recensioni
- Fasce di disponibilità multiple/per-servizio da mobile, gestione eccezioni (giorni bloccati) da UI
- i18n multilingua (oggi solo italiano, vedi `src/i18n/strings.ts`)
- Icone/splash screen personalizzati (oggi si usano i default Expo)
