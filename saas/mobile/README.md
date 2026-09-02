# Ipsofarma CRM — involucro nativo (Fasi 1-3 del piano app)

Questa cartella **non contiene una riscrittura della SaaS**: è un involucro
[Capacitor](https://capacitorjs.com) che apre le stesse pagine di `saas/web/`
dentro un'app nativa vera (icona propria, presenza sullo store, accesso ai
plugin del telefono), senza duplicare una riga di codice. Il "come" e il
"perché" di questa scelta — rispetto a una riscrittura nativa — sono nella
nota strategica pubblicata a inizio Fase 1 (Capacitor invece di React
Native/Flutter: stesso team, stesso codice, settimane non mesi).

## Come funziona

`capacitor.config.json` punta `server.url` all'indirizzo pubblico dove sono
ospitate le pagine di `saas/web/` — l'app nativa è di fatto un browser senza
barra degli indirizzi che carica quell'URL, più i plugin nativi (fotocamera,
notifiche push, biometria) aggiunti via Capacitor mano a mano che servono
(Fase 3 del piano). La cartella `www/` è un segnaposto minimo richiesto da
Capacitor anche in modalità `server.url` — non è mai quello che si vede
davvero.

## L'hosting

Le pagine in `saas/web/` sono pubblicate su Cloudflare Workers (static
assets), collegato al repository GitHub — `capacitor.config.json` punta a
`https://ipsofarma-crm.stefanobozzo82.workers.dev`.

**Nota per chi tocca la configurazione di deploy**: il file `wrangler.jsonc`
alla radice del repository è quello che decide COSA viene pubblicato
(`assets.directory: "saas/web"`). La primissima volta che il progetto è
stato collegato, quel file non esisteva ancora: Cloudflare ne ha generato
uno da sé puntando all'intera cartella del repository invece che a
`saas/web` — pubblicando per sbaglio anche `.git/` e un progetto non
correlato che vive nello stesso spazio di lavoro. Corretto committando
`wrangler.jsonc` esplicitamente (anche `"preview_urls": false`, perché
ogni deploy genera un URL di anteprima permanente a sé: disattivarlo
chiude l'accesso anche alle versioni già pubblicate, non solo alle
prossime). **Se in futuro il deploy ricomincia a pubblicare più di
`saas/web`, il primo posto da controllare è che `wrangler.jsonc` esista
ancora alla radice del repository e non sia stato spostato o rinominato.**

## Come compilare (Android)

Serve un SDK Android — non serve un Mac per questa parte (a differenza di
iOS, che richiede Xcode). Da questa stessa sessione è stato verificato un
build completo e funzionante:

```bash
cd saas/mobile
npm install
npx cap sync android          # copia capacitor.config.json nel progetto nativo
cd android
echo "sdk.dir=/percorso/al/tuo/Android/sdk" > local.properties
./gradlew assembleDebug       # produce android/app/build/outputs/apk/debug/app-debug.apk
```

L'.apk di debug si installa direttamente su un telefono Android (o un
emulatore) per collaudo — non è ancora firmato per la pubblicazione sul
Play Store, quello richiede una chiave di firma e l'account Google Play
Console (vedi checklist sotto).

## Come compilare (iOS) — richiede un Mac

```bash
cd saas/mobile
npx cap add ios       # genera la cartella ios/, non ancora fatto qui (serve Xcode)
npx cap sync ios
npx cap open ios      # apre Xcode, da lì si compila/firma/pubblica
```

## Plugin nativi aggiunti (Fase 3 del piano app)

Il resto dell'app resta un browser che carica `saas/web/` (vedi sopra): i
plugin nativi aggiungono capacità che una pagina web da sola non ha,
richiamate dalle pagine tramite `window.Capacitor.Plugins.*` — presente in
automatico dentro l'app nativa, `undefined` in un browser normale (le
pagine restano identiche e funzionanti anche fuori dall'app).

- **`@aparajita/capacitor-biometric-auth`** (blocco con impronta/volto) e
  **`@capacitor/app`** (per sapere quando l'app torna in primo piano) —
  vedi `saas/web/app/biometric-lock.js`.
- **Permesso `CAMERA`** nel manifest (nessun pacchetto npm: la fotocamera
  nel selettore file di sistema, vedi `saas/web/app/camera-import.js`).
- **`@capacitor-community/speech-recognition`** (dettatura vocale nella
  pagina Assistente AI, registrato lato Android come `"SpeechRecognition"`)
  — serve perché il WebView di Android, a differenza di Chrome vero e
  proprio, non implementa affatto la Web Speech API del browser (manca
  l'integrazione col servizio di riconoscimento di Google che solo Chrome
  ha): senza questo plugin il pulsante 🎤 non funzionerebbe per niente
  dentro l'app. Vedi `saas/web/assistente-ai.html`.

**Nota tecnica per chi tocca questi plugin**: le pagine di `saas/web/`
sono servite da un URL remoto (`server.url`, vedi sopra), non dal bundle
JS di questa cartella — quindi il codice JS "di comodo" che i pacchetti
npm dei plugin distribuiscono (es. `BiometricAuth.authenticate()` nella
documentazione di `@aparajita/capacitor-biometric-auth`) non è mai
caricato dalle pagine vere, e chiamarlo lì non farebbe nulla. Quello che
FUNZIONA sempre è il bridge nativo di Capacitor stesso, che espone
direttamente ogni plugin registrato lato Android con il suo nome e i suoi
metodi nativi REALI (es. `Capacitor.Plugins.BiometricAuthNative.
internalAuthenticate(...)`, non `.authenticate(...)` — il nome esatto si
trova nell'annotazione `@CapacitorPlugin(name = "...")` del sorgente
Java/Kotlin del plugin, in `node_modules/<pacchetto>/android/src/.../*.java`,
mai dato per scontato dalla sola documentazione JS). Aggiungere un nuovo
plugin nativo in futuro richiede lo stesso controllo.

## Checklist per pubblicare davvero (fuori dal codice, solo l'azienda può farlo)

- [x] **Hosting** per `saas/web/` — Cloudflare Workers, collegato al
      repository GitHub (vedi sopra). `server.url` in
      `capacitor.config.json` aggiornato con l'indirizzo vero.
- [ ] **Icona e splash screen** dell'app — oggi sono i segnaposto generici
      di Capacitor (vedi `android/app/src/main/res/mipmap-*`), vanno
      sostituiti con la grafica vera di Ipsofarma prima della pubblicazione.
- [ ] **Google Play Console** — account sviluppatore (25$ una tantum),
      serve per pubblicare su Android; genera anche la chiave di firma per
      le build di release (diverse da quella di debug usata sopra).
- [ ] **Apple Developer Program** — account (~99$/anno) + un Mac con
      Xcode, serve per pubblicare su iOS.
- [ ] **Materiale per la scheda dello store** — descrizione, screenshot,
      politica sulla privacy (obbligatoria su entrambi gli store per
      un'app che gestisce dati aziendali/finanziari).

## Nome pacchetto scelto

`com.ipsofarma.crm` — non richiede possedere un dominio (è solo un
identificativo, a differenza di quanto serve per l'email via Resend,
sezione dedicata nel README di `saas/`): se in futuro cambia meglio farlo
ora che dopo la prima pubblicazione sullo store, perché l'identificativo
dell'app non è più modificabile una volta pubblicata.
