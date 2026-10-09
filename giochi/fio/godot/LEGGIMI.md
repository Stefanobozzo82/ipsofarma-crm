# Fio in Godot 4: prototipo

Il prototipo contiene Fio, la telecamera che lo segue da dietro, l'**Isola del Faro**, la **Sala delle Mappe** e il **Vulcano**
(la prima mappa vera da provare). Le geometrie dei livelli sono esportate dalla versione web, quindi sono identiche.

## Come aprirlo
1. Scarica **Godot 4.3** (o più recente), versione standard: https://godotengine.org/download
2. Apri Godot → *Importa* → scegli il file `project.godot` di questa cartella.
3. Al primo avvio Godot importa i modelli (qualche secondo). Premi **F5** per giocare.

## Android
L'APK pronto è `../download/fio-godot.apk` (si installa accanto a Fio web, con il nome "Fio Godot").
Sul telefono: joystick a sinistra, tasti Salta / Pesta / Pugno a destra, trascina sul resto dello schermo per girare la telecamera.
Per rifarlo dall'editor: *Progetto → Esporta → Android*, con l'SDK Android e una chiave di firma impostati.

## Comandi
| Azione | Tastiera | Joypad |
| --- | --- | --- |
| Muoviti | WASD / frecce | levetta sinistra, croce |
| Salta (doppio e triplo correndo) | Spazio | A |
| Accovacciati, schianto in aria, salto lungo / all'indietro con Salta | Shift o K | LB, grilletti |
| Pugno, tuffo correndo, calcio in aria | J | X o B |
| Telecamera | Q / E, trascina il mouse, rotellina | levetta destra |
| Telecamera alle spalle | C | RB o Y |
| Pausa | Esc o P | Start |
| Schermo intero | F11 | |

## Cosa c'è già
- Movimenti portati dalla versione web con gli stessi numeri: corsa, salti concatenati, salto lungo, salto all'indietro,
  salto dal muro, schianto a terra, pugno, tuffo e calcio, scalini bassi.
- Monete, gemme rosse, Scintille (salvate in `user://fio_save.json`), Nebbioli che si schiacciano saltandoci sopra o col pugno.
- Piattaforme mobili, lava del Vulcano, cadute in mare, vite e game over.
- Porta del Faro ↔ Sala delle Mappe; mappe sigillate che respingono; la mappa del Vulcano porta nel mondo (servono 3 Scintille).

## Cosa manca (prossimi passi)
- Gli altri 19 mondi, i personaggi e le missioni speciali, i boss, i filmati e la storia.
- Aggrapparsi alle sporgenze, nuoto, pali, Aliante e Corazza di Pietra, cannoni e catapulte.
- Musiche ed effetti sonori (da registrare dalla versione web in file OGG), menu completo e opzioni.

## Test automatico (QA)
`godot --path . -- --autotest` gioca da solo un breve percorso (corsa, salto, moneta, Sala delle Mappe, Vulcano)
e salva log e screenshot nella cartella `user://autotest/`.

## Riesportare i livelli dalla versione web
In `tools/`:
1. `python3 crea_export_html.py ../../index.html export.html`
2. `node esporta_livelli.js export.html ../assets/levels/` (serve Playwright con Chromium).
   Il file `fio.glb` e `props.glb` finiscono nella stessa cartella: spostali in `assets/models/`.
