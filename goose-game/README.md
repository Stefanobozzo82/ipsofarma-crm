# Il Ritorno dell'Oca

Point-and-click d'avventura in stile *Machinarium*, ma in una città-fattoria steampunk abitata da **oche**.
Godot **4.3+** (GDScript, nessun plugin esterno). Atmosfera malinconica, nessun dialogo scritto: le oche
comunicano con **fumetti di pensiero** (icone animate) e versi *honk*.

> Il protagonista, un'oca goffa ma ingegnosa, viene gettato in una discarica dalla banda delle **Oche Nere**.
> Deve tornare in città e raggiungere la torre dell'orologio prima che il loro piano si compia.

## Avvio

1. Apri la cartella `goose-game/` con Godot 4.3+ (Importa → `project.godot`).
2. Premi **F5**. La prima apertura importa il progetto (qualche secondo).

Risoluzione base 1920×1080, `stretch mode = canvas_items`, `aspect = keep`. Renderer *GL Compatibility*.

## Come si gioca

| Azione | Comando |
|---|---|
| Muoversi / interagire | clic sinistro su terreno / hotspot / oggetto / personaggio |
| Selezionare un oggetto d'inventario | clic sullo slot in basso (clic destro o secondo clic sullo stesso slot per deselezionare) |
| Usare l'oggetto selezionato | clic sul punto della scena dove usarlo |
| Combinare due oggetti | seleziona un oggetto e clicca su un altro slot dell'inventario |
| Posa **normale / collo allungato / abbassata** | pulsanti in basso a sinistra, oppure tasti **1 / 2 / 3** |
| Suggerimento | lampadina in basso a destra, oppure **H** |
| Pausa / opzioni (volumi) | pulsante ingranaggio, oppure **Esc** |
| Modalità debug | **F1** (vedi sotto) |

Il collo allungato raggiunge le cose in alto, abbassarsi permette di infilarsi sotto o raccogliere da terra:
se la posa è sbagliata l'oca mostra un fumetto con l'icona della posa che serve.
Il salvataggio è **automatico** (`user://save.json`); «Continua» nel menu riprende dall'ultima scena.

## Struttura del progetto

```
goose-game/
├─ project.godot
├─ data/                      ← TUTTO il contenuto di gioco (modificabile senza toccare il codice)
│  ├─ game.json               scena iniziale, velocità, parallasse, colori dell'oca
│  ├─ items.json              oggetti d'inventario e ricette di combinazione
│  └─ scenes/<id>.json        una scena: navigazione, oggetti, puzzle, luci, FX, suggerimenti, minigiochi
├─ assets/
│  ├─ backgrounds/            <scena>.png, <scena>_mid.png, <scena>_fg.png   (vedi sotto)
│  └─ sprites/                sprite di personaggi, oggetti, icone           (vedi sotto)
├─ scenes/                    level.tscn (scena generica), hotspot/pickup/npc/goose.tscn, menu, ending, minigames/
├─ scripts/
│  ├─ autoload/               GameState · SceneManager · AudioManager
│  ├─ core/                   Level, Interactable (base) → Hotspot / Pickup / Npc, GooseActor/GooseVisual,
│  │                          ActionRunner (azioni dei puzzle), DebugOverlay, PlaceholderArt, SceneBackdrop…
│  ├─ minigames/              Minigame (base), LeverSequence, PipeMaze, GearRings
│  ├─ ui/                     HUD, menu, impostazioni, tema
│  └─ fx/                     Atmosphere (particelle, luci, tinta)
├─ shaders/grain_vignette.gdshader   grana + vignettatura + seppia su tutto lo schermo
└─ tools/                     smoke_test (test automatico), shot (screenshot)
```

**Autoload**: `GameState` (flag di progresso, inventario, posa, salvataggio), `SceneManager` (cambio scena con
dissolvenza + overlay grana/vignettatura), `AudioManager` (musica e effetti procedurali, bus *Music/SFX/Ambience*).

**Audio**: nessun file audio. La musica ambient è generata con `AudioStreamGenerator`, gli *honk* e gli effetti
sono sintetizzati all'avvio in `AudioStreamWAV`. Slider volume nel menu principale e di pausa.

## Sostituire la grafica (convenzione dei nomi)

Il gioco funziona già con **segnaposto** disegnati a codice (gradienti, sagome, forme). Per sostituirli basta
copiare i PNG nelle cartelle giuste col nome giusto: se il file c'è viene usato, altrimenti resta il segnaposto.
Non serve cambiare nulla nel codice né nei JSON (Godot li importa al prossimo avvio dell'editor).

### Sfondi — `assets/backgrounds/`

| File | Contenuto | Note |
|---|---|---|
| `<scena>.png` | sfondo completo, **1920×1080** | resta fermo; qui devono coincidere hotspot e navigazione |
| `<scena>_mid.png` | piano intermedio | PNG con trasparenza, **dietro** ai personaggi, parallasse leggera |
| `<scena>_fg.png` | primo piano | PNG con trasparenza, **davanti** ai personaggi, parallasse più marcata |

`<scena>` è l'id della scena: `dump`, `canal`, `tower`, `clock_room`
(es. `assets/backgrounds/dump.png`, `assets/backgrounds/dump_fg.png`).
Ogni piano è indipendente: puoi fornire solo `dump.png` e lasciare segnaposto gli altri.
Immagini di dimensione diversa vengono scalate a 1920×1080.

### Sprite — `assets/sprites/`

| File | Cosa sostituisce |
|---|---|
| `goose.png` | **tutta** l'oca protagonista in un solo sprite (piedi sull'origine = metà inferiore centrale dell'immagine, guarda a **destra**); la posa «collo allungato/abbassata» è simulata con una deformazione |
| `goose_body.png` `goose_wing.png` `goose_neck.png` `goose_head.png` `goose_foot.png` | singole parti (modalità a pezzi, con tutte le animazioni). Dimensioni consigliate: corpo 100×66, ala 60×34, collo 16×48 (si stira in verticale), testa 34×26 con becco (se c'è `_head` il becco/occhio segnaposto spariscono), piede 22×8 |
| `npc_<id>.png` (+ `npc_<id>_body.png`, …) | un personaggio (`npc_nonna.png`, `npc_otto.png`, `npc_boss.png`…): stesse regole dell'oca |
| `<id>.png` | un hotspot o un oggetto raccoglibile con quell'`id` (`winch.png`, `gate.png`, `cog.png`…): disegnato centrato nel riquadro del suo poligono, spostabile con `"sprite_offset": [x, y]` nel JSON. Per usare un nome diverso: `"sprite": "nome"` |
| `item_<oggetto>.png` | icona dell'oggetto nell'inventario e nei fumetti (`item_cog.png`…) |
| `icon_<nome>.png` | icona dei fumetti di pensiero e dei pulsanti (`icon_neck.png`, `icon_heart.png`, `icon_bulb.png`…) |

Quando l'oggetto è già dipinto nello sfondo, metti `"invisible": true` nel suo hotspot: resta solo l'area cliccabile.

## Modalità debug — F1

**F1** attiva/disattiva la modalità debug (il parallasse si ferma, per allineare tutto con precisione):

- **cyan** = area di navigazione, **rosso** = buchi (ostacoli), **arancio** = poligoni cliccabili degli oggetti,
  **verde** (rombo) = punto in cui l'oca si ferma per interagire, **viola** (quadrato) = punti di spawn,
  **giallo** (quadrato) = posizione dei personaggi.
- **Trascina** i pallini per spostarli. Il pallino **bianco** al centro di un hotspot sposta tutto l'oggetto.
- **Maiusc + clic** vicino a un bordo = aggiunge un vertice; **Canc** sul vertice sotto il mouse = lo rimuove.
- **F2** oppure **Ctrl+S** = salva le coordinate in `data/scenes/<scena>.json` (il messaggio verde conferma il file).
  Nel gioco esportato `res://` non è scrivibile: il salvataggio va in `user://data/scenes/` e ha la precedenza.
- La navigazione si ricalcola in tempo reale; per testarla basta uscire dal debug (F1) e cliccare.

Flusso tipico per ricalibrare con i tuoi sfondi: copia `dump.png` → F5 → F1 → trascina i poligoni di
navigazione sul pavimento dipinto e gli hotspot sugli oggetti → F2 → F1.

## Aggiungere una scena o un livello

1. Crea `data/scenes/<nuova>.json` (parti copiando una scena esistente) e aggiungi l'id a `"scenes"` in `data/game.json`.
2. Collegala: un'azione `{"a": "goto", "scene": "<nuova>", "spawn": "<punto>"}` in un altro livello.
3. Opzionale: `assets/backgrounds/<nuova>.png` e gli sprite. Poi F1 per posizionare tutto.

Nessuno script da modificare. Schema di una scena:

```jsonc
{
  "id": "dump", "mood": "dump",            // mood musicale: menu|dump|canal|tower|finale
  "ambience": "wind",                      // wind | water | clock | ""
  "tint": "#9a9184",                       // luce ambiente (CanvasModulate)
  "depth": {"y": [560, 930], "scale": [0.78, 1.12]},   // prospettiva: scala dell'oca tra la y minima e massima
  "spawns": {"start": [260, 840]},         // "start" = ingresso predefinito
  "nav": {"polygons": [[[x,y], ...]], "holes": [[[x,y], ...]]},   // area calpestabile e ostacoli
  "placeholder": { ... },                  // sfondo segnaposto (cielo, terreno, "decor": [forme])
  "objects": [ ... ],                      // hotspot, pickup, npc
  "lights": [ ... ], "fx": [ ... ],        // PointLight2D (bagliori sull'ottone) e GPUParticles2D (nebbia, vapore, polvere)
  "minigames": {"id": {"type": "...", "config": { ... }}},
  "on_enter": [ {"once": "flag", "do": [azioni]} ],   // scenette all'ingresso
  "hints": [ {"if": {condizione}, "icons": [...], "target": "id"} ]   // lampadina: il primo che vale
}
```

**Oggetti** (`objects`): `type` = `hotspot` | `pickup` | `npc`.

- `hotspot`: `poly` (poligono cliccabile), `walk_to` (dove si ferma l'oca), `color`, `icon`, `visible_if`, `interactions`.
- `pickup`: come sopra + `item` (default = `id`) e `pose` opzionale (`neck`/`crouch`). Senza `interactions`
  si raccoglie da solo (flag `got_<id>`) o mostra il fumetto con la posa richiesta.
- `npc`: `pos` (piedi), `walk_to`, `facing` (1/-1), `scale`, `voice` (0-2), `palette`, `accessory`
  (`scarf hat goggles apron glasses cap bowler bandana`), `pos_if` (posizioni alternative in base ai flag).

**Condizioni** (`when`, `visible_if`, `if`): `flags`, `not_flags`, `has`, `not_has`, `pose`; nelle regole anche
`item` (l'oggetto usato; `"*"` = qualunque; assente = clic semplice).

**Interazioni**: lista di regole `{"when": {...}, "do": [azioni]}`; vale la **prima** che soddisfa la condizione.

**Azioni** (`do`): `bubble {who, icons, time}` · `honk {who}` · `flag {flag, value}` · `give/take {item}` ·
`sfx {name}` · `wait {s}` · `move {who, to}` · `look {who}` · `shake {amount, time}` ·
`minigame {id, win:[…], lose:[…]}` · `if {when, then, else}` · `goto {scene, spawn}` · `ending`.
Nuove azioni: un ramo in `ActionRunner._exec()` (`scripts/core/action_runner.gd`).

**Icone dei fumetti**: `cog big_gear oilcan rag rod knob crank worm fish rope book key lever pipe valve boat wave clock
skull heart no question exclaim zzz neck crouch stand goose goose_black cold home sun lock arrow_right arrow_up winch gate
bell bulb`. Una nuova icona = un ramo in `IconPainter` oppure semplicemente `assets/sprites/icon_<nome>.png`.

**Oggetti d'inventario**: `data/items.json` (`items` + `combos`: `{a, b, result, consume}`).
**Nuovi minigiochi**: estendi `Minigame`, crea `scenes/minigames/<tipo>.tscn`, referenziali con `"type": "<tipo>"`.
**Nuovi tipi di oggetto**: estendi `Interactable` e registrali in `Level.OBJECT_SCENES`.

## Soluzione (spoiler)

1. **Discarica** — Ingranaggio sotto il carretto (*abbassata*, tasto 3) · oliatore in cima al palo (*collo*, tasto 2) ·
   straccio → nonna Ruggine (ha freddo) → ti dà il pomello · asta + pomello = **manovella** (clic su uno slot,
   poi sull'altro) · usa ingranaggio, oliatore e manovella sull'argano · clic sull'argano: **minigioco leve** (ripeti la
   sequenza di lampade) · cancello aperto → canale.
2. **Canale** — Verme sotto il sasso (*abbassata*) → pescatrice Berta (ti dà un pesce) → pesce a Otto, che dorme sulla
   valvola · corda sulla gru (*collo*) · clic sul pannello della valvola: **minigioco tubi** (ruota i tubi finché
   l'acqua arriva alla barca) · usa la corda sulla barca, poi sali.
3. **Torre** — Libro sullo scaffale alto (*collo*) → bibliotecaria Pagina (ti dà la chiave) · oliatore alla meccanica
   Vite (ti dà il grande ingranaggio) · chiave sulla porta · **Sala dell'orologio**: grande ingranaggio nella sede ·
   leva del freno in alto (*collo*) · pannello: **minigioco anelli** (porta i tre denti d'ottone in cima; ogni anello ne
   trascina un altro, la legenda a sinistra mostra quale e in che verso).

## Test automatici

```
godot --headless --path goose-game res://tools/smoke_test.tscn
```

Valida i JSON (id, riferimenti, flag, oggetti, walk_to/spawn dentro la navigazione, goto), la logica dei tre
minigiochi e **gioca l'intera avventura** risolvendo tutti i puzzle. Esce con codice 0 se tutto va bene.
Utile dopo ogni modifica ai file in `data/`.
