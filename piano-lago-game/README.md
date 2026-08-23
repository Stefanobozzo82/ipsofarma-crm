# Piano Lago (nome di lavoro)

Farm management / simulazione di crescita ed evoluzione, ispirato a Hay Day, Township, Farmville, Stardew Valley e Animal Crossing: New Horizons. Progetto isolato dal resto del repository — vedi la nota sotto.

**Nota sul repository:** questo repo contiene attualmente un CRM farmaceutico non correlato (`index.html`, `catalogo.json`, script Gmail/agente di stampa) nella root, oltre al progetto pet-sitting in `pet-sitting-app/`. Piano Lago vive interamente dentro `piano-lago-game/` — nessun file esistente toccato.

## Documentazione

- [`docs/GAME-DESIGN.md`](./docs/GAME-DESIGN.md) — documento di game design completo: concept, analisi dei giochi di riferimento, direzione artistica, meccaniche di gioco, struttura menu, economia, loop di sessione e stack tecnico consigliato per un primo prototipo.

## Prototipo

- [`prototype/index.html`](./prototype/index.html) — prototipo giocabile del loop base, un unico file HTML/CSS/JS senza build né dipendenze: basta aprirlo in un browser.

Copre il primo gradino dello stack tecnico indicato nel documento di design (§10, punti 1 e 4): griglia di semina con 12 zolle (6 sbloccate all'inizio, le altre si sbloccano salendo di livello), tre colture con tempi di crescita diversi (ravanello, grano, zucca), ciclo ara→semina→annaffia→cresci→raccogli con timer visibile, cesta/inventario, bacheca ordini con un cliente alla volta e reward in monete + XP, e progressione a livelli. Energia, stagioni, edifici di trasformazione e le altre zone di Piano Lago sono le fasi successive elencate nel documento.

Salva i progressi in `localStorage` (per browser, nessun backend). Nessuna dipendenza esterna a parte i font da Google Fonts.

## Stato

Documento di game design completo. Primo prototipo giocabile del loop base pronto (vedi sopra). Prossimi passi secondo il piano di sviluppo del documento: animali + produzione manuale, edifici di trasformazione a catena, sistema energia/giorno-notte/stagioni, decorazioni e mappa zone, missioni.
