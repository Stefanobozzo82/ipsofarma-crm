# Piano Lago Valley

Farm life sim in stile Stardew Valley / Harvest Moon, web app HTML5 + [Phaser 3](https://phaser.io),
salvataggio locale via `localStorage`. Alessia eredita la vecchia fattoria "Piano Lago" e deve
farla rinascere.

Questo è l'**MVP**: movimento tile-based, terreno coltivabile (zappa/semina/annaffia/raccogli),
ciclo giorno/notte, energia, inventario/hotbar, cassa di spedizione, sonno per passare al giorno
successivo, salvataggio automatico. Tutta la grafica è **placeholder geometrico generato a runtime**
(nessun asset esterno) così possiamo iterare sulle meccaniche prima di disegnare gli sprite definitivi.

## Come avviare il gioco

Il codice usa moduli ES nativi (`import`/`export`), quindi va servito via HTTP (non funziona aprendo
`index.html` direttamente da filesystem con `file://`). Phaser 3 è vendorizzato in locale
(`vendor/phaser.min.js`): nessuna dipendenza da CDN esterni, funziona anche offline. Da questa
cartella:

```bash
# una qualsiasi di queste va bene
npx serve .
python3 -m http.server 8000
```

Poi apri `http://localhost:PORTA/` nel browser.

## Comandi

| Azione | Tasto |
| --- | --- |
| Muoviti | Frecce oppure `WASD` |
| Usa strumento / interagisci | `E` oppure `Spazio` |
| Seleziona slot hotbar | `1`-`5` |
| Apri/chiudi inventario | `I` (o `ESC` per chiudere) |

Il player si muove **a griglia**, una casella alla volta, rivolto verso la direzione dell'ultimo
tasto premuto. L'azione (`E`/Spazio) agisce sulla casella verso cui Alessia è rivolta:

- **Zappa** selezionata su erba nell'area coltivabile (recinto centrale) → ara il terreno.
- **Annaffiatoio** su terreno arato → lo annaffia (necessario ogni giorno perché la coltura cresca).
- **Semi** (es. "Semi di Rapa") su terreno arato libero → pianta, se la stagione è corretta.
- Casella con coltura matura → raccoglie automaticamente, indipendentemente dallo strumento in mano.
- **Cassa di spedizione** (vicino alla casa) → vende l'intera pila del raccolto selezionato in hotbar.
- **Porta di casa** → dorme e passa al giorno successivo (autosave incluso). Se l'orologio arriva
  alle 26:00 (2:00 di notte) Alessia crolla dalla stanchezza e il giorno finisce comunque.

Ascia, piccone e canna da pesca sono già nell'inventario/hotbar come **placeholder funzionale**:
selezionabili e usabili, ma l'interazione mostra un messaggio "in arrivo" perché bosco, miniera e
pesca sono le prossime iterazioni.

## Struttura del progetto

```
piano-lago-valley/
├── index.html              # shell della pagina, canvas, carica Phaser da CDN
└── src/
    ├── main.js              # config Phaser + registrazione scene
    ├── config.js             # costanti globali (tile size, mappa, orologio, ecc.)
    ├── core/
    │   ├── GameState.js       # forma dello stato di gioco (serializzabile) + stato iniziale
    │   └── SaveManager.js      # load/save su localStorage
    ├── data/
    │   ├── tiles.js            # tipi di tile, proprietà, layout mappa fattoria
    │   ├── crops.js             # colture: tempi di crescita, stagioni, prezzi
    │   └── items.js              # strumenti + risoluzione oggetti (semi/raccolti)
    ├── systems/
    │   ├── TimeSystem.js         # orologio, giorno/stagione/anno, fattore notte
    │   ├── FarmingSystem.js       # zappa/annaffia/pianta/raccogli/vendi/crescita giornaliera
    │   └── InventorySystem.js      # inventario a slot stackabile
    ├── entities/
    │   └── Player.js               # movimento a griglia, input, tween, direzione
    └── scenes/
        ├── BootScene.js            # genera tutte le texture placeholder
        ├── MenuScene.js             # Nuova Partita / Continua
        ├── FarmScene.js              # mappa, collisioni, interazioni, ciclo giorno/notte
        └── UIScene.js                 # HUD, hotbar, inventario, toast (scena separata in parallelo)
```

Lo **stato di gioco** (`GameState`) è l'unica fonte di verità: ogni sistema legge/scrive lì dentro,
`FarmScene` e `UIScene` condividono lo stesso oggetto per riferimento, e `SaveManager.save(state)` è
letteralmente `JSON.stringify` sull'intero stato. Questo rende il salvataggio banale da estendere
man mano che si aggiungono meccaniche.

## Roadmap (ordine di priorità)

- [x] 1. Movimento a griglia + mappa fattoria + collisioni + ciclo giorno/notte
- [x] 2. Agricoltura: zappa/semina/annaffia/raccolta, stagioni, crescita giornaliera
- [x] 3. Energia/stamina, fine giornata, sonno, autosave
- [x] 4. Inventario a slot + hotbar + strumenti equipaggiabili (placeholder per ascia/piccone/canna)
- [x] 5. Economia base: denaro, cassa di spedizione (manca ancora il negozio del paese)
- [ ] 6. Mappa del paese + negozio + NPC con routine e dialoghi + amicizia/regali
- [ ] 7. Bosco esplorabile (raccolta legna/pietre/forageable) + miniera procedurale + combattimento base
- [ ] 8. Minigioco di pesca
- [ ] 9. Allevamento (galline, mucche, edifici dedicati)
- [ ] 10. UI/UX avanzata (schermata pausa dedicata, impostazioni, più feedback visivo)

Ogni voce della roadmap è pensata per essere aggiunta come nuova scena e/o nuovo `system`, senza
toccare la struttura esistente: es. la mappa del paese sarà una nuova `TownScene` che riusa
`Player`, `TimeSystem` e lo stesso `GameState`, collegata a `FarmScene` da un punto di transizione
sul bordo della mappa.

## Note sugli asset

Tutti i colori/forme in `BootScene.js` sono placeholder generati via `Phaser.GameObjects.Graphics`
+ `generateTexture`. Quando saranno pronti gli sprite pixel art definitivi (stile Alessia/Piano
Lago Valley), basterà sostituire il contenuto di `BootScene` con il caricamento di uno spritesheet
reale (`this.load.spritesheet(...)`) mantenendo invariate le chiavi delle texture (`tile_grass`,
`player_down`, ecc.) usate dal resto del codice.
