# web

Sito marketing pubblico di Fido (React + Vite + Tailwind + React Router) — la homepage che un potenziale cliente o sitter vede prima di scaricare l'app o candidarsi. **Non è l'app** (vedi `mobile/`) **né il pannello admin** (vedi `admin/`), ma condivide con entrambi lo stesso progetto Supabase per l'autenticazione: chi si registra sul sito ha già un account pronto per l'app. Deployato come Render Static Site.

## Setup

```bash
# dalla root di pet-sitting-app/
pnpm install
pnpm dev:web   # http://localhost:5175
```

`pnpm build` produce `dist/` come sito statico. Deployato su Render come **Static Site** (Root Directory `pet-sitting-app`, Build Command `npx pnpm@9.7.0 install && npx pnpm@9.7.0 --filter web build`, Publish Directory `web/dist` — stesso account/repo del backend, stesso accorgimento `npx pnpm@9.7.0` scoperto lì per l'errore EROFS di Render con corepack).

## Struttura di riferimento

L'ordine e l'organizzazione delle sezioni della homepage riprendono deliberatamente la struttura della homepage italiana di Rover.com (riferimento **strutturale**, non di brand — colori, font, testi e illustrazioni sono originali, coerenti col design system già usato in `mobile/`).

```
src/
├── App.tsx                        # Header + <Routes> (Home/Accedi/Registrati/Account) + Footer
├── main.tsx                       # <BrowserRouter> a livello radice
├── pages/
│   ├── HomePage.tsx                # le 9 sezioni della homepage, in ordine
│   ├── LoginPage.tsx / RegisterPage.tsx
│   └── AccountPage.tsx             # conferma account minimale, vedi sotto
├── data/                          # contenuto editabile senza toccare i componenti
│   ├── services.ts                # le 5 categorie (riusa ServiceType da @fido/shared)
│   ├── cities.ts                  # directory città per SEO
│   ├── testimonials.ts
│   └── faq.ts
├── components/
│   ├── layout/
│   │   ├── Header.tsx             # sticky, ombra dopo qualche px di scroll, dropdown servizi, stato auth
│   │   └── Footer.tsx
│   ├── sections/                  # una per sezione del brief, modificabile da sola
│   │   ├── Hero.tsx
│   │   ├── ServicesGrid.tsx
│   │   ├── TrustSection.tsx
│   │   ├── Testimonials.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── Faq.tsx
│   │   ├── AppPromo.tsx
│   │   └── CityDirectory.tsx
│   └── ui/                        # Button, ServiceCard, Accordion, SearchForm, SitterResultCard, SectionHeading
├── store/auth-store.ts             # sessione Supabase (stesso pattern di mobile/admin)
├── lib/
│   ├── env.ts                     # VITE_API_URL + VITE_SUPABASE_URL/ANON_KEY
│   ├── supabase.ts                # client Supabase, solo auth
│   ├── api.ts                     # fetch verso il backend (solo GET /search/sitters per ora)
│   ├── geocode.ts                 # indirizzo testuale → lat/lng via Nominatim
│   └── placeholder-link.ts        # onClick condiviso per i link "#" senza destinazione reale
└── index.css                      # font @fontsource + direttive Tailwind
```

Non esiste `components/layout/MobileNavDrawer.tsx` come componente isolato per caso: **è renderizzato via `createPortal` direttamente in `<body>`**, non come figlio di `<Header>` — vedi sotto.

## Decisioni di branding

- **Palette**: gli stessi valori esadecimali "terracotta/miele" del design system mobile (`mobile/src/theme/colors.ts`, solo i valori "light" — il sito non ha modalità scura, come Rover.com stesso), riportati in `tailwind.config.ts`. Sito e app sembrano la stessa azienda.
- **Font**: Nunito (titoli) + Inter (testo), auto-ospitati via `@fontsource/*` — nessuna richiesta esterna a Google Fonts, buone performance.
- **Icone**: `lucide-react`, l'equivalente web di `lucide-react-native` già usato in `mobile/`. Nota: la libreria **non include più i loghi dei brand** (Instagram/Facebook/YouTube rimossi in una versione recente) — nel footer sono icone generiche con `aria-label` esplicito.
- **Illustrazioni**: nessuna foto stock. Le illustrazioni (blob sfumato in hero, mockup del telefono) sono CSS/SVG puro — oneste (non fingono di essere foto vere) e non richiedono immagini con diritti da sourcizzare.
- **Badge store e mockup app**: l'app non è ancora pubblicata su App Store/Google Play (vedi `mobile/README.md`) — i badge sono volutamente disattivati con l'etichetta "Presto disponibile" invece di linkare a store inesistenti.
- **Directory città**: parte dalla zona di lancio reale (Cosenza e dintorni, la stessa di `mobile/src/i18n/strings.ts`) invece di promettere una copertura nazionale inesistente. `src/data/cities.ts` è pensato per essere esteso man mano che la copertura cresce.

## Ricerca sitter: collegata al backend vero

Il modulo di ricerca nell'hero (`components/ui/SearchForm.tsx`) chiama `GET /search/sitters` sul vero backend — pubblica, nessun login richiesto (stesso endpoint di `mobile/(tabs)/index.tsx`, vedi `backend/src/modules/search/search.service.ts`).

- **Geocoding**: il backend lavora solo con lat/lng, ma il campo del sito è testo libero ("Indirizzo o città"). Convertito lato client via **Nominatim** (OpenStreetMap), l'unico geocoder gratuito senza bisogno di una chiave API/account — Google/Mapbox richiederebbero di attivare fatturazione solo per una casella di ricerca. Va bene per il traffico di un sito appena lanciato; la policy di Nominatim (max 1 richiesta/sec, uso "leggero") suggerisce di valutare un provider a pagamento o un'istanza self-hosted se il traffico crescesse molto. Campo vuoto → cerca sul centro di Cosenza (stessa costante `DEFAULT_COORDS` di `mobile/src/lib/location.ts`).
- **CORS**: perché il browser possa leggere la risposta, l'origine del sito deve essere nella lista `CORS_ORIGIN` del backend (vedi `backend/.env.example` — in locale già include `http://localhost:5175`). **In produzione va aggiunto anche il dominio reale del sito deployato**, sennò la richiesta parte ma il browser blocca la risposta (nessun errore lato server, solo `Access-Control-Allow-Origin` mancante) — il sito mostra comunque un messaggio d'errore pulito ("Qualcosa è andato storto"), non si rompe, ma la ricerca resta di fatto non funzionante finché l'origine non è in whitelist.
- **Risultati**: card sitter reali (`components/ui/SitterResultCard.tsx`) sotto il modulo — foto o iniziale su sfondo terracotta come fallback (stessa logica di `SitterAvatar` in mobile), stelline, distanza, prezzo. Stato vuoto onesto se non ci sono sitter per quel servizio/zona (oggi il seed ha un solo sitter, per `dog_walking` — cercare altri servizi mostra correttamente "nessun risultato", non un errore).
- **Verificato** con chiamate dirette al backend deployato (non solo build/typecheck): confermato che l'endpoint risponde con dati reali, e che l'enforcement CORS si comporta come atteso (nessun header di permesso per un'origine non in whitelist, presente per una in whitelist).

Non c'è ancora una pagina di dettaglio sitter o un flusso di prenotazione sul sito — solo l'app li ha. Le card dei risultati sono quindi informative, non cliccabili verso altro.

## Autenticazione: account vero, stesso di mobile/admin

`/registrati` e `/accedi` chiamano `supabase.auth.signUp`/`signInWithPassword` direttamente — stesso pattern di `mobile/src/store/auth-store.ts` (nota architetturale in `backend/src/modules/auth/auth.service.ts`: per client con l'SDK Supabase, è la via raccomandata invece di passare dal backend). Un account creato sul sito è già utilizzabile per accedere nell'app: stesso progetto Supabase, stesso trigger `handle_new_auth_user()` che popola `public.users` dai metadati (`first_name`/`last_name`/`gdpr_consent`, vedi la migrazione `20260812120100_users_and_profiles.sql`).

- **`/account`**: pagina volutamente minima — il sito non ha un'area personale vera (nessuna prenotazione o profilo da gestire qui, solo l'app li ha). Conferma che l'account esiste, mostra nome/email (da `session.user.user_metadata`, nessuna chiamata autenticata al backend necessaria), invita a scaricare l'app. Rimbalza su `/accedi` se non c'è sessione.
- **Variabili d'ambiente da configurare su Render**: il sito (servizio **web**, non il backend) ha bisogno di `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — stessi valori già presenti nell'Environment del servizio **backend** su Render (copiabili da lì). L'anon key è pensata per stare nel client, non è un segreto da proteggere.
- **Bug reale trovato e corretto**: se queste due variabili non sono ancora impostate, `createClient(url, key)` lancia un errore **al caricamento del modulo** (`supabaseUrl is required.` / `supabaseKey is required.`) — non solo sulle pagine di login, l'intero sito smette di renderizzare, perché `lib/supabase.ts` viene importato anche solo per leggere lo stato di sessione nell'header. Fix in `lib/env.ts`: un fallback sintatticamente valido ma inesistente (`https://placeholder.supabase.co`) evita il crash al caricamento; se le variabili vere mancano davvero in produzione, a fallire sarà solo il singolo tentativo di login/registrazione quando invocato (un errore di rete gestito con un messaggio in italiano, non una pagina bianca). Verificato con un build di produzione + Playwright: prima del fix l'intero sito falliva a renderizzare, dopo il fix homepage/routing/redirect funzionano correttamente anche senza credenziali Supabase configurate.
- **Rewrite rule da aggiungere su Render** (servizio **web**): `/accedi`, `/registrati` e `/account` non sono file statici reali — esistono solo lato client (React Router). Cliccare i link dal sito funziona già oggi (navigazione via `Link`, nessuna richiesta al server), ma **digitare uno di questi indirizzi direttamente nel browser, aggiornare la pagina, o aprire un link condiviso dà 404** finché non si aggiunge una regola di rewrite: Render → servizio web → *Redirects/Rewrites* → sorgente `/*`, destinazione `/index.html`, tipo **Rewrite** (non Redirect).

## Bug non ovvio risolto: il drawer mobile e `backdrop-filter`

Il drawer di navigazione mobile (`MobileNavDrawer.tsx`) inizialmente era un figlio diretto di `<Header>`, posizionato `fixed inset-0`. Sembrava corretto, ma si rompeva in un modo non ovvio: il pannello risultava alto solo ~66px (l'altezza della barra header) invece di coprire l'intero schermo.

Causa: `<Header>` ha `backdrop-blur` (`backdrop-filter`) per l'effetto vetro sullo sticky header. In CSS, `transform`, `filter`, `backdrop-filter`, `perspective`, `contain` e `will-change` su un antenato creano un **nuovo containing block** per i discendenti `position: fixed` — che quindi non si posizionano più rispetto al viewport, ma rispetto a quell'antenato. Il fix: il drawer è renderizzato con `createPortal` direttamente in `document.body`, fuori dall'albero dell'header, esattamente come si farebbe per una modale.

Verificato con screenshot reali (Playwright) a viewport desktop (1440px) e mobile (390px), sia a drawer chiuso che aperto — non solo con la build che passa, dato che questo tipo di bug non emerge né dal build né dal typecheck.

## Link segnaposto

"Diventa un sitter", "Contatti", le colonne del footer e le icone social **non hanno ancora** una destinazione reale — restano `<a href="#">` con `onClick` che chiama `preventPlaceholderNav` (`src/lib/placeholder-link.ts`) per evitare l'effetto collaterale di un `href="#"` normale (senza, cliccarli fa scrollare la pagina in cima). Accedi/Registrati non sono più in questo elenco: hanno una destinazione vera (`/accedi`, `/registrati`).

## Cosa manca (prossime fasi)

- **CORS in produzione**: il dominio reale del sito deployato va aggiunto a `CORS_ORIGIN` sul backend (Render → variabili d'ambiente del servizio backend) — senza, la ricerca resta bloccata lato browser anche se tutto il resto funziona
- **Rewrite rule su Render** per le pagine `/accedi`, `/registrati`, `/account` — vedi sopra, senza si rompe solo l'accesso diretto/il refresh, non la navigazione dal sito
- **`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`** da impostare sul servizio web di Render — vedi sopra
- Nessun risultato cliccabile: le card sitter mostrate dalla ricerca non portano a un profilo o a una prenotazione (esistono solo nell'app) — da decidere se costruire pagine profilo/prenotazione anche sul sito o restare un "assaggio" che rimanda all'app
- Newsletter footer: nessun endpoint di iscrizione esiste ancora
- "Diventa un sitter" e "Contatti" nell'header sono link segnaposto (`#`) — da decidere se pagine separate o sezioni della stessa homepage
- Nessuna pagina dedicata per città/servizio ancora (oggi solo homepage) — se in futuro serve indicizzazione SEO più profonda, valutare se questo sito basta o se serve un framework con rendering server-side
- Copertura assicurativa/garanzia menzionata in `TrustSection`/FAQ come "in arrivo" — collegare al vero gap prodotto quando sarà implementato
