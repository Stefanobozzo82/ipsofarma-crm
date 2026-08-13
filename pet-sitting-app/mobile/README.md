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

**Aggiornamento — bug reale trovato solo eseguendo l'app su un device vero**: "bundle torna 200 da Metro" non vuol dire "il JS gira senza errori" — gap nel test sopra, scoperto dall'utente che ha effettivamente aperto l'app su Android dopo l'aggiornamento SDK 54. Schermata rossa immediata: `TypeError: getDevServer is not a function (it is Object)` nella connessione WebSocket di debug. Causa: `@expo/metro-runtime` non era mai stato un dependency diretto — arrivava solo transitivamente da `expo`, fermo alla `4.0.1` (compatibile con SDK 52), mentre `expo-router@6` (SDK 54) richiede `^6.1.2`; `expo install --fix` non lo aveva toccato perché non è nel nostro `package.json`. Fix: `npx expo install @expo/metro-runtime` per fissarlo esplicitamente alla versione giusta. Verificato non solo con `pnpm why` (una sola risoluzione, `6.1.2`, ovunque nell'albero — prima ce n'erano tre diverse coesistenti) ma ispezionando il bundle scaricato da Metro: nessun riferimento residuo a `4.0.1`.

## Design system (redesign UI/UX)

Ripartenza dell'identità visiva su ispirazione Rover/Wag/PetBnb (reinterpretata,
non copiata) — da un tema verde cipresso/ambra piuttosto freddo/corporate a
uno caldo terracotta/miele, coerente con un prodotto emotivo legato alla
fiducia verso sitter e animali. Fase 1 di un lavoro incrementale: prima i
token e i componenti base (qui), poi le schermate una alla volta.

- **Palette** (`src/theme/colors.ts`): `accent` (terracotta, brand/azioni
  primarie) separato da un nuovo token `success` (salvia) — prima
  "positivo" nei badge di stato viveva sullo stesso token del brand, quindi
  ogni badge "confermato/completato" sarebbe finito arancione invece che
  verde: una vera perdita di leggibilità, non solo estetica, corretta in
  `StatusBadge.tsx`.
- **Tipografia** (`src/theme/tokens.ts`): *Nunito* (titoli, arrotondato e
  caldo) + *Inter* (corpo testo, leggibile) via `@expo-google-fonts/*`,
  caricati in `app/_layout.tsx` con `expo-splash-screen` a coprire il
  caricamento (niente flash col font di sistema).
- **Ombre** (`src/theme/tokens.ts` → `shadow`): non esisteva alcun token
  ombra prima — ogni card si distingueva solo con un bordo sottile, più
  piatto di quanto il redesign richieda. `Card.tsx` ora usa `shadow.sm`
  di default (`elevation="flat"` per disattivarla dentro contenuti già
  sollevati, es. righe in un modale).
- **Bottoni** (`Button.tsx`): `secondary` passa da pieno grigio a bordo
  terracotta trasparente (si distingueva poco da uno stato disabilitato),
  aggiunta una variante `text` per azioni minori. Micro-interazione al
  tocco: leggera scala (0.97) via `Pressable`, nessuna libreria di
  animazione aggiuntiva.
- **Input** (`TextField.tsx`): bordo che vira sull'accento a fuoco — prima
  zero riscontro visivo di campo attivo oltre al cursore.
- **Icone**: da Ionicons (solo tab bar + stelle recensione, migrazione a
  basso rischio) a `lucide-react-native` — stroke uniforme, coerente in
  tutta l'app.

Verificato non solo con `tsc --noEmit` su tutto il monorepo (incluso un giro
completo da `node_modules` rimossi, per escludere falsi positivi di cache)
ma richiedendo i bundle `platform=ios`/`platform=android` a un vero Metro
con le nuove dipendenze (font, `react-native-svg`, icone) — entrambi `200`.

**Fase 3a — Ricerca/Home** (`app/(tabs)/index.tsx`, `SitterCard.tsx`), la
prima schermata vera aggiornata dopo i componenti base:

- **`SitterCard`**: prima mostrava solo nome/città/prezzo/un glifo `★` di
  testo per il voto — ora una card "protagonista" con avatar (foto del
  sitter se presente, iniziale su sfondo sfumato terracotta→miele come
  fallback, mai un placeholder grigio anonimo), il componente `StarRating`
  vero al posto del glifo (coerenza — lo stesso pattern usato ovunque nel
  resto dell'app, non reinventato qui), e il prezzo con l'unità di tariffa
  visibile (`per_walk`/`per_hour`/..., prima assente).
- **Header di ricerca**: icona di posizione (Lucide `MapPin`) accanto al
  sottotitolo "A Cosenza e dintorni" — un piccolo segnale di luogo che
  prima era solo testo.
- **Stato vuoto**: icona (`SearchX`) invece di solo testo grigio quando la
  ricerca non trova sitter — meno "errore muto", più intenzionale.

I filtri a chip per servizio (`dog_walking`/`boarding`/...) erano già
corretti nella forma (pill, bordo, stato selezionato pieno) — ereditano la
nuova palette automaticamente dal tema senza bisogno di modifiche, prova
diretta che investire nei componenti/token base prima delle schermate
riduce il lavoro dopo.

**Fase 3b — Profilo sitter** (`app/sitter/[id].tsx`), dove il brief del
redesign chiede di costruire fiducia:

- **Header**: da un blocco di solo testo (nome + città/esperienza/voto su
  un'unica riga) a un hero con foto grande (o iniziale su sfondo sfumato
  come fallback, stessa logica di `SitterCard`), nome, e il voto con lo
  stesso componente `StarRating` — prima anche qui un glifo `★` di testo,
  incoerente col resto dell'app.
- **Badge "Sitter verificato"** (`VerifiedBadge`, Lucide `BadgeCheck` +
  token `success`): primo punto in cui compare — ogni profilo pubblico
  appartiene per forza a un sitter già approvato, quindi qui è sempre
  vero, non condizionale. Pensato per essere riusato identico ovunque
  serva più avanti (dashboard sitter, admin), come chiede il brief.

Servizi, politica di cancellazione e recensioni erano già strutturati bene
(card per servizio, `StarRating` già in uso nelle recensioni) — nessuna
modifica strutturale, solo eredità automatica della nuova palette. Bottoni
di azione (`Contatta` / `Meet & Greet` secondari, `Prenota` primario)
invariati nella gerarchia, migliorati automaticamente dal nuovo `Button`.

**Fase 3c — Flusso di prenotazione** (`app/booking/new.tsx`,
`app/booking/[id].tsx`), la parte del brief che chiede esplicitamente di
essere "il più semplice e rassicurante possibile":

- **Creazione prenotazione** (`booking/new.tsx`):
  - Nuova card di riepilogo in cima al form — icona `PawPrint` su sfondo
    terracotta chiaro, servizio, nome del sitter e tariffa: prima si
    scopriva "con chi e a che prezzo" solo tornando indietro al profilo,
    ora è la prima cosa visibile aprendo il form.
  - Animali coinvolti e date/orari ora raggruppati in `Card` distinte
    invece di essere testo/controlli sciolti nella pagina — il form si
    legge come una sequenza di passaggi, non un modulo unico indistinto.
  - `DateField` (selezione data/ora): prima un riquadro con solo testo,
    poteva leggersi come un'etichetta statica invece che un controllo.
    Ora ha un'icona iniziale (`CalendarDays`/`Clock` a seconda che sia
    data o orario) e una `ChevronRight` finale — lo stesso linguaggio
    "c'è altro dietro, tocca per cambiare" già usato altrove nel
    redesign — più un feedback di sfondo al tocco (`Pressable`).
- **Dettaglio/pagamento prenotazione** (`booking/[id].tsx`):
  - Header trasformato da riga di solo testo (titolo + badge a destra) a
    un piccolo hero coerente col resto dell'app: icona `PawPrint` in un
    chip circolare terracotta chiaro accanto al nome del servizio, badge
    di stato spostato sotto il titolo invece che schiacciato a destra.
  - Righe data/note nella card di riepilogo ora hanno un'icona coerente
    col contenuto (`CalendarDays` per le date, `NotebookText` per le
    note) invece di essere solo etichetta+valore.
  - **Totale prezzo**: prima un'ultima riga enfatizzata solo dal colore,
    ora dentro un riquadro con sfondo terracotta chiaro — la cifra più
    importante della schermata (quanto si paga/si incassa) è isolata
    visivamente dal resto del riepilogo, non solo dal font.
  - **Rassicurazione al pagamento**: sotto il bottone "Paga ora" (quando
    visibile) una riga con icona `Lock` e "Pagamento sicuro gestito da
    Stripe" — un pattern standard nei marketplace (Airbnb/Rover) per
    ridurre l'ansia del primo pagamento in un'app nuova, prima assente.

Nessuna modifica alla logica di prenotazione/pagamento (creazione, step
di date/orari per tipo di tariffa, integrazione `stripe-react-native`,
transizioni di stato): solo presentazione. `PetPicker` non ha richiesto
modifiche — usava già i token `accentSoft`/`accent`/`line` corretti,
stessa conclusione delle chip servizio in Fase 3a.

**Fase 3d — Servizio in corso** (`ServiceTrackingPanel.tsx`,
`ServiceUpdatesList.tsx`), la schermata che il brief chiede di rendere
"viva": qualcuno deve sentire che il servizio è davvero monitorato mentre
è in corso, non solo vedere una lista di controlli.

- **Tracking GPS attivo**: prima solo una riga di testo "Tracking in
  corso…". Ora un pallino che pulsa accanto al testo (`PulseDot`, con
  `Animated` già incluso in React Native — nessuna libreria aggiunta) —
  lo stesso linguaggio di "live indicator" usato da Rover/Wag durante una
  passeggiata in corso.
- **Distanza percorsa** (a tracking concluso): da una riga di testo a uno
  stat con icona `Footprints` in un chip circolare terracotta chiaro e
  numero in evidenza — lo stesso pattern icona+chip già usato nell'header
  di `booking/[id].tsx` in Fase 3c, non reinventato qui.
- **Lista aggiornamenti**: da una sequenza di card scollegate a una vera
  timeline — pallino + linea connettrice a sinistra di ogni card (la
  linea si allunga automaticamente all'altezza della card grazie al
  comportamento di default di `flexDirection: "row"` in RN, senza
  bisogno di misurare nulla a mano). Stato vuoto con icona (`Inbox`)
  invece di solo testo, coerente con gli altri stati vuoti dell'app.

Nessuna modifica alla logica di tracking (permessi posizione,
`watchPositionAsync`, invio update al backend) o ai limiti già noti (solo
`dog_walking`, solo foreground — vedi "Cosa manca" più sotto).

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
