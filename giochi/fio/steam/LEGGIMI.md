# Fio per Steam (Electron + Steamworks)

Pacchetto desktop del gioco per Windows/Linux (Steam Deck), pronto da collegare a Steamworks.

## Come provarlo
1. Installa Node.js 20 o più recente.
2. In questa cartella crea `game/` e copiaci dentro `../download/fio.html` rinominato `index.html` (più `icon-512.png` per l'icona).
3. `npm install` e poi `npm start`: il gioco si apre a schermo intero (F11 per uscire dallo schermo intero).
4. `npm run pack:win` crea la build per Windows in `dist/`, da caricare su Steam con SteamPipe.

## Collegare Steam
- Dopo aver creato l'app su Steamworks, imposta il tuo App ID in `main.js` (`STEAM_APP_ID`) o nella variabile `FIO_STEAM_APP_ID`.
  Finché resta 480 (l'app di prova di Valve) gli obiettivi non vengono salvati sul tuo account.
- Crea questi obiettivi su Steamworks con gli stessi ID: il gioco li sblocca da solo.

| ID | Quando si sblocca |
| --- | --- |
| PRIMA_SCINTILLA | Prima Scintilla raccolta |
| CHIAVE_ARGENTO | Fumaccio sconfitto (chiave d'argento) |
| CHIAVE_ORO | Re del Gelo sconfitto (chiave d'oro) |
| CAPITAN_FOSCO | Grande Scintilla della Rocca di Capitan Fosco |
| TUTTE_LE_SCINTILLE | Tutte le 176 Scintille |

Nel browser e nell'APK questi richiami non fanno nulla.
