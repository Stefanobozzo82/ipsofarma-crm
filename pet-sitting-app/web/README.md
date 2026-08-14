# web

Sito marketing pubblico di Fido (React + Vite + Tailwind) — la homepage che un potenziale cliente o sitter vede prima di scaricare l'app o candidarsi. **Non è l'app** (vedi `mobile/`) **né il pannello admin** (vedi `admin/`): nessuna autenticazione reale, nessuna chiamata al backend per ora — è un sito statico, deployabile come semplici file HTML/CSS/JS.

## Setup

```bash
# dalla root di pet-sitting-app/
pnpm install
pnpm dev:web   # http://localhost:5175
```

`pnpm build` produce `dist/` come sito statico, pronto per qualunque host di file statici (Render, Netlify, GitHub Pages, ecc. — non ancora deciso/configurato).

## Struttura di riferimento

L'ordine e l'organizzazione delle sezioni della homepage riprendono deliberatamente la struttura della homepage italiana di Rover.com (riferimento **strutturale**, non di brand — colori, font, testi e illustrazioni sono originali, coerenti col design system già usato in `mobile/`).

```
src/
├── App.tsx                        # assembla Header + le 9 sezioni + Footer, in ordine
├── data/                          # contenuto editabile senza toccare i componenti
│   ├── services.ts                # le 5 categorie (riusa ServiceType da @fido/shared)
│   ├── cities.ts                  # directory città per SEO
│   ├── testimonials.ts
│   └── faq.ts
├── components/
│   ├── layout/
│   │   ├── Header.tsx             # sticky, ombra dopo qualche px di scroll, dropdown servizi
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
│   └── ui/                        # Button, ServiceCard, Accordion, SearchForm, SectionHeading
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

## Bug non ovvio risolto: il drawer mobile e `backdrop-filter`

Il drawer di navigazione mobile (`MobileNavDrawer.tsx`) inizialmente era un figlio diretto di `<Header>`, posizionato `fixed inset-0`. Sembrava corretto, ma si rompeva in un modo non ovvio: il pannello risultava alto solo ~66px (l'altezza della barra header) invece di coprire l'intero schermo.

Causa: `<Header>` ha `backdrop-blur` (`backdrop-filter`) per l'effetto vetro sullo sticky header. In CSS, `transform`, `filter`, `backdrop-filter`, `perspective`, `contain` e `will-change` su un antenato creano un **nuovo containing block** per i discendenti `position: fixed` — che quindi non si posizionano più rispetto al viewport, ma rispetto a quell'antenato. Il fix: il drawer è renderizzato con `createPortal` direttamente in `document.body`, fuori dall'albero dell'header, esattamente come si farebbe per una modale.

Verificato con screenshot reali (Playwright) a viewport desktop (1440px) e mobile (390px), sia a drawer chiuso che aperto — non solo con la build che passa, dato che questo tipo di bug non emerge né dal build né dal typecheck.

## Link segnaposto

Tutte le voci senza una destinazione reale ancora (Accedi, Registrati, Diventa un sitter, Contatti, le colonne del footer, le icone social) restano `<a href="#">` — semanticamente link veri, navigabili da tastiera — ma con `onClick` che chiama `preventPlaceholderNav` (`src/lib/placeholder-link.ts`) per evitare l'effetto collaterale di un `href="#"` normale: senza, cliccarli fa scrollare la pagina in cima, un comportamento confuso soprattutto su una CTA primaria come "Registrati ora". Quando queste destinazioni esisteranno davvero, basta sostituire `href="#"` con l'URL vero e rimuovere l'`onClick`.

## Cosa manca (prossime fasi)

- Nessuna chiamata reale al backend: il modulo di ricerca nell'hero ha stato controllato ma non è collegato a `GET /sitters/search` — da decidere come/se collegare sito e app (stesso backend? redirect all'app?)
- Newsletter footer: nessun endpoint di iscrizione esiste ancora
- "Diventa un sitter" e "Contatti" nell'header sono link segnaposto (`#`) — da decidere se pagine separate o sezioni della stessa homepage
- Nessuna pagina dedicata per città/servizio ancora (oggi solo homepage) — se in futuro serve indicizzazione SEO più profonda, valutare se questo sito basta o se serve un framework con rendering server-side
- Copertura assicurativa/garanzia menzionata in `TrustSection`/FAQ come "in arrivo" — collegare al vero gap prodotto quando sarà implementato
