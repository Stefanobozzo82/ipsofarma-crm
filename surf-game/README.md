# 🏄‍♀️ Nasty Surf

Gioco browser di surf in pixel art — protagonista una surfista che cavalca
un'onda procedurale, fa carving, salta e concatena trick in aria.

Nessuna libreria esterna, nessun CDN, nessun build step: **apri `index.html`
direttamente nel browser** (doppio click o `file://…/surf-game/index.html`)
e si gioca.

## Comandi

| Tasto              | Azione                                              |
| ------------------- | ---------------------------------------------------- |
| `↑` / `W` (tieni premuto) | Accelera (curva di accelerazione non lineare) |
| `←` `→`             | Carving sx/dx — inversioni strette danno un boost   |
| `SPAZIO`            | Salto (in riding, con velocità sufficiente)          |
| `←↑→↓` in aria       | Inserisci una combo entro la finestra temporale per un trick |
| `P`                 | Pausa                                                |
| `M`                 | Silenzia/riattiva l'audio                            |
| `↑`/`↓` + `INVIO`, o clic | Nel menu: naviga e seleziona il livello        |
| `ESC`                | Torna al menu (da pausa o da fine livello)          |

## Struttura del progetto

```
surf-game/
├── index.html          punto di ingresso unico
├── css/style.css        stile minimo, canvas pixelated
└── js/
    ├── config.js         TUTTE le costanti tunabili (nessun valore hardcoded
    │                      nella logica): fisica, curve di accelerazione,
    │                      parametri onda per livello, tabella trick, punteggi
    ├── utils.js           RNG seedato, math helper, collisioni AABB/cerchio,
    │                      wrapper localStorage con fallback in-memory,
    │                      state machine generica riutilizzabile
    ├── sprites.js         pixel art (griglie 2D → fillRect), palette colori
    ├── wave.js             onda procedurale (somma di sinusoidi parametrizzate
    │                      da altezza/velocità/curvatura del livello)
    ├── tricks.js           trick system: risolve la sequenza di input aerei
    │                      contro CONFIG.TRICKS
    ├── player.js           la surfista: position/velocity/state machine
    │                      (idle → paddling → riding → aerial → wipeout),
    │                      comboCount/comboMultiplier, carving, hold-to-accelerate
    ├── obstacles.js        spawner procedurale di ostacoli (rocce = AABB,
    │                      boe = cerchio-cerchio)
    ├── audio.js             suoni procedurali via Web Audio API (oscillatori +
    │                      buffer di rumore filtrato, nessun asset esterno)
    ├── ui.js                HUD e schermate (menu, pausa, fine livello)
    ├── input.js             tastiera/mouse: stati "held" + azioni edge-triggered
    ├── game.js              state machine di gioco (menu/playing/paused/
    │                      levelComplete) e orchestrazione dei moduli
    └── main.js               bootstrap: canvas, game loop con delta time
```

## Architettura

- **Game loop a delta time**: `main.js` calcola `dt` reale a ogni frame
  (clampato per evitare la "spiral of death"), nessuna logica dipende dal
  frame count.
- **State machine esplicita** (`Utils.StateMachine`): usata sia per il flusso
  di gioco (menu/playing/paused/levelComplete) sia per gli stati del player
  (idle/paddling/riding/aerial/wipeout) — ogni stato è un oggetto
  `{enter, update, exit}`, nessun if/else annidato.
- **Onda procedurale**: `wave.js` genera la superficie sommando tre
  armoniche la cui ampiezza/frequenza/fase derivano da `{height, speed,
  curvature, seed}` del livello in `config.js` — cambia quei numeri e
  l'onda cambia forma.
- **Persistenza**: high score salvato in `localStorage` per livello, con
  fallback automatico in memoria se `localStorage` non è disponibile
  (modalità privata, storage pieno, ecc.).

## Testing effettuato

Il gioco è stato aperto ed eseguito in un vero browser Chromium (via
Playwright, non solo anteprima sandbox), verificando:

- 0 errori in console durante menu, gameplay, pausa, wipeout, fine livello;
- loop stabile a ~60 fps;
- input reattivo (accelerazione, carving con boost, salto, combo trick in
  aria, pausa, navigazione menu da tastiera e da mouse);
- collisioni AABB (rocce) e cerchio-cerchio (boe);
- persistenza high score su `localStorage` e fallback in memoria quando
  `localStorage` è bloccato.
