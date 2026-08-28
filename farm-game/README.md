# 🌻 Fattoria Serena

Gioco web di simulazione agricola (nome e asset originali, nessuna dinamica
o contenuto copiato da giochi esistenti).

## Stack

- React + Vite + TypeScript
- Tailwind CSS 4
- Zustand (stato globale + persistenza automatica su `localStorage`)
- Sprite placeholder in emoji, organizzati per essere sostituiti facilmente
  con asset grafici reali

## Avvio

```bash
npm install
npm run dev
```

## Struttura del progetto

```
src/
  game/
    types.ts          # tipi di dominio (colture, animali, edifici, celle...)
    store.ts           # stato globale Zustand + tutte le azioni di gioco
    utils.ts           # meteo, livelli/XP, formattazione tempo
    data/
      crops.ts          # config colture (tempo crescita, costo, ricompensa)
      animals.ts        # config animali (produzione, crescita, incroci)
      buildings.ts       # habitat, edifici di produzione (ricette), decorazioni
      goods.ts          # beni grezzi/lavorati (prezzi di vendita)
  components/
    FarmGrid.tsx        # griglia della fattoria (semina/raccolta/piazzamento)
    CellTile.tsx        # singola cella (terreno, coltura, edificio, habitat...)
    BuildingModal.tsx    # pannello habitat (compra/nutri/incrocia/raccogli)
                         # e pannello edifici di produzione (crafting/ordini)
    ShopMenu.tsx        # menu di costruzione a categorie
    Inventory.tsx        # magazzino con vendita rapida
    OrderBoard.tsx       # bacheca ordini NPC
    MissionPanel.tsx     # missioni giornaliere
    ResourceBar.tsx      # monete, gemme, livello/XP, meteo
    FloatingPopups.tsx   # feedback pop-up (monete/XP guadagnati)
```

## Dinamiche implementate

- Griglia espandibile (sblocco caselle con monete)
- Semina/crescita a tempo reale/raccolta, con meteo che influenza i tempi
- Animali con crescita dei cuccioli (sfamare periodicamente), produzione di
  beni e incroci per varianti rare
- Edifici di produzione con ricette di crafting (mulino, caseificio, forno,
  filanda)
- Bacheca ordini con ricompense in monete/XP/gemme
- Costruzione/decorazione a piazzamento libero sulla griglia
- Livelli/XP, doppia valuta (monete/gemme), missioni giornaliere
- Salvataggio automatico su `localStorage`

Tutti i dati di gioco (colture, animali, edifici) sono centralizzati in
`src/game/data/` per poter aggiungere nuovi contenuti facilmente.
