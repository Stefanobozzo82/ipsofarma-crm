# PIANO LAGO — Documento di Game Design
### Un gioco di gestione ed evoluzione della fattoria

**Protagonista:** Alessia
**Fattoria:** Piano Lago
**Genere:** Farm management / simulazione di crescita ed evoluzione
**Direzione artistica:** Cartoon colorato, morbido, in stile Hay Day / Township

---

## 1. Concept in una frase

Alessia eredita un terreno abbandonato affacciato su un lago (Piano Lago) e deve trasformarlo, coltivazione dopo coltivazione, edificio dopo edificio, in una fattoria fiorente e riconosciuta, gestendo colture, animali, produzione artigianale, ordini dei clienti ed espansione del territorio.

---

## 2. Analisi dei giochi di riferimento

Ogni titolo di punta del genere farm-sim porta un tassello diverso. Il progetto Piano Lago unisce i meccanismi più solidi di ciascuno:

| Gioco | Cosa prendiamo |
|---|---|
| **Hay Day** | Estetica cartoon calda e "pulita", sistema di ordini via camion/nave, banco vendita ai visitatori, silos e granai come contenitori visivi, animazioni "pop" soddisfacenti su ogni azione |
| **Township** | Doppio loop città + fattoria, produzione a catena in fabbriche, aerei/treni per commerci a lunga distanza, collezioni tematiche da completare |
| **Farmville (e derivati)** | Griglia di semina chiara, timer di crescita visibili, meccanica "raccolto che appassisce se non raccolto in tempo", decorazioni cosmetiche per punteggio estetico |
| **Stardew Valley** | Profondità simulativa: stagioni, energia giornaliera, relazioni con NPC, miniere/pesca come attività secondarie, personalizzazione profonda della fattoria e della casa |
| **Animal Crossing: New Horizons** | Cura maniacale del "sentirsi a casa": personalizzazione estetica, eventi stagionali, ritmo rilassato, senso di progressione tramite Nook Miles / obiettivi collezionistici |

**Sintesi progettuale:** Piano Lago userà il *loop di produzione a catena* di Township, il *sistema di ordini e camion* di Hay Day, il *ritmo stagionale ed energia* di Stardew Valley, la *griglia di semina con timer* di Farmville e la *cura estetica/personalizzazione* di Animal Crossing.

---

## 3. Direzione artistica (stile Hay Day / Township)

- **Palette:** colori vivaci ma morbidi — verdi prato, giallo grano, azzurro lago, marroni caldi legno. Nessun colore acceso saturo al 100%: tutto leggermente "pastellato" per un effetto accogliente.
- **Personaggi:** proporzioni chibi/stilizzate (testa grande, corpo tondeggiante), animazioni "squash & stretch" morbide.
- **Ambiente:** vista isometrica 2.5D, ombre morbide sotto ogni oggetto, terreno con texture disegnata a mano (non fotorealistica).
- **UI:** pannelli con bordi arrotondati spessi, legno chiaro/carta come materiale di sfondo, icone con contorno bianco spesso (stile sticker), micro-animazioni "bounce" su ogni tap.
- **Effetti:** particellari di monetine, cuoricini, stelline al completamento di un'azione; nuvolette di fumo sopra gli edifici in produzione; increspature sul lago animate.
- **Il lago come elemento distintivo:** a differenza di Hay Day e Township, Piano Lago ha uno specchio d'acqua centrale che riflette il cielo (giorno/notte, meteo) e diventa progressivamente location di pesca, molo, e decorazioni acquatiche — è il tratto visivo unico del gioco.

---

## 4. Personaggio: Alessia

- Avatar personalizzabile (capelli, pelle, vestiti da lavoro) ma con base fissa: Alessia, giovane erede della fattoria.
- Espressioni facciali reattive: sorride raccogliendo, suda zappando, si stira le spalle a fine giornata.
- Guardaroba sbloccabile come sistema di progressione estetica (stivali, cappelli di paglia, grembiuli) — ricompensa da missioni ed eventi stagionali.
- Alessia non combatte: la sua "sfida" è gestionale e creativa, coerente col genere.

---

## 5. La fattoria: Piano Lago

**Struttura del terreno (a zone sbloccabili):**
1. **Il Cortile** (zona iniziale) — orto, pollaio, casa di Alessia
2. **I Campi** — semina su larga scala, stalla per mucche/pecore
3. **Il Frutteto** — alberi da frutto a crescita lunga, apiario
4. **La Riva del Lago** — molo, pesca, canneti, anatre
5. **Il Bosco** — raccolta legna, funghi, tartufi (risorse rare)
6. **Il Villaggio** (fine gioco) — mercato, relazioni con NPC, eventi comunitari

Ogni zona si sblocca pagando monete + materiali + raggiungendo un livello fattoria minimo, mantenendo la sensazione di **evoluzione progressiva** richiesta dal titolo del gioco.

---

## 6. Meccaniche di gioco (core loop)

### 6.1 Coltivazione
- Griglia di appezzamenti (stile Farmville): si ara, si semina, si annaffia, si aspetta un timer visibile, si raccoglie.
- Colture diverse per tempo di crescita e valore (ravanelli veloci/economici → zucche lente/costose).
- Meteo dinamico: pioggia annaffia automaticamente, gelo può danneggiare colture non protette (introduce gestione del rischio).

### 6.2 Allevamento
- Animali (galline, mucche, pecore, api, anatre) producono risorse a ciclo (uova, latte, lana, miele) da raccogliere manualmente o con edifici automatici sbloccabili.
- Cura e felicità animale: sfamare regolarmente aumenta la resa (loop di manutenzione leggero, non punitivo).

### 6.3 Produzione a catena (stile Township)
- Edifici di trasformazione: mulino (grano→farina), caseificio (latte→formaggio), forno (farina→pane), frantoio, ecc.
- Ricette a più livelli creano una vera "catena del valore": materia prima → semilavorato → prodotto finito di alto valore.

### 6.4 Ordini e commercio (stile Hay Day)
- **Bacheca ordini locali:** clienti chiedono combinazioni di prodotti entro un tempo, in cambio di monete ed esperienza.
- **Camion/barca per il lago:** contratti a lungo raggio con ricompense migliori ma tempi più lunghi.
- **Bancarella:** vendita passiva ai visitatori mentre Alessia è offline.

### 6.5 Energia e ritmo giornaliero (stile Stardew Valley)
- Barra energia che si consuma con le azioni manuali e si ricarica dormendo.
- Ciclo giorno/notte e stagioni (Primavera–Estate–Autunno–Inverno) che cambiano colture disponibili, eventi ed estetica del lago.

### 6.6 Espansione e decorazione (stile Animal Crossing)
- Valuta secondaria (es. "Perle di Lago") per decorazioni puramente estetiche: staccionate, fiori, statue, arredo del molo.
- Punteggio "Bellezza fattoria" che sblocca visitatori speciali e bonus di vendita.

### 6.7 Missioni e progressione
- Missioni giornaliere brevi (variabilità e ritorno quotidiano).
- Missioni di storia principale (sblocco zone, personaggi, retroscena di Piano Lago).
- Sistema a livelli fattoria con ricompense a ogni salita (nuovi semi, edifici, slot inventario).
- Collezioni tematiche (stile Township) da completare per bonus permanenti.

### 6.8 Elementi sociali (opzionali, fase 2)
- Visita alle fattorie di altri giocatori (solo lettura/aiuto, no PvP) per restare in linea con il tono rilassato del genere.
- Cooperative giornaliere della "comunità del lago" (obiettivo condiviso, es. donare pesce per una festa).

---

## 7. Struttura dei menu (ispirata ai titoli più curati graficamente)

**Schermata principale (in gioco):**
- HUD superiore: monete, gemme/valuta premium, livello e barra XP, energia, meteo/stagione — tutto in pillole arrotondate stile Hay Day.
- Bottoni laterali fissi (stile Township): Negozio, Ordini, Missioni, Inventario, Decora.
- Icone fluttuanti sopra edifici pronti per l'interazione (raccolto pronto, produzione completata) — feedback visivo immediato senza aprire menu.

**Menu Negozio:** tab orizzontali (Semi / Animali / Edifici / Decorazioni), card con anteprima grande, prezzo, e tempo di produzione in evidenza.

**Menu Ordini:** stile "bacheca fisica" con foglietti appesi, ognuno con avatar del cliente, richiesta illustrata con icone (non testo puro) e timer a clessidra.

**Menu Missioni:** libro/diario di Alessia con pagine sfogliabili, illustrazioni per ogni traguardo di storia.

**Menu Inventario:** griglia con categorie filtrabili, drag & drop per assegnare prodotti agli ordini.

**Schermata Mappa Fattoria:** vista dall'alto zoomabile di tutte le zone di Piano Lago, per navigazione rapida e senso di progressione visiva (le zone sbloccate sono rigogliose, quelle bloccate appaiono "addormentate" sotto la nebbia — forte richiamo estetico alla crescita).

---

## 8. Economia di gioco

- **Moneta primaria:** Monete — da vendita prodotti/ordini, usata per semi, animali, edifici base.
- **Moneta secondaria (soft-premium):** Perle di Lago — da missioni/eventi, usata per decorazioni ed espansioni estetiche.
- **Moneta premium (se monetizzato):** Gemme — acceleratori di timer, slot extra; progettata come *opzionale*, mai bloccante per i contenuti principali (per rispettare il tono "rilassante" del genere).

---

## 9. Loop di sessione tipo (5–15 minuti)

1. Apertura gioco → controllo notifiche (raccolti pronti, ordini scaduti in arrivo, animali da nutrire).
2. Raccolta rapida + rifornimento semina.
3. Controllo bacheca ordini e consegna prodotti pronti.
4. Una missione giornaliera breve.
5. Eventuale decorazione/spesa estetica con Perle di Lago.
6. Uscita con "compiti a tempo" impostati (colture in crescita, produzione in corso) che invogliano il ritorno.

---

## 10. Se si passa alla costruzione: stack tecnico consigliato

Per un prototipo giocabile in ambiente browser (artifact):
- **React + Tailwind** per UI a pannelli arrotondati e HUD.
- **Canvas/SVG o sprite CSS** per la vista isometrica della fattoria (2.5D semplificata).
- **Stato di gioco in memoria** (nessun localStorage in artifact): salvataggio persistente da valutare in una fase successiva con storage dedicato.
- **Fasi di sviluppo consigliate:**
  1. Griglia di semina + raccolta (loop base)
  2. Animali + produzione manuale
  3. Edifici di trasformazione (catena di produzione)
  4. Bacheca ordini
  5. Sistema energia/giorno-notte/stagioni
  6. Decorazioni e mappa zone
  7. Missioni e progressione a lungo termine

---

## Prossimo passo

Questo documento è pensato come base solida e "prompt" di riferimento per costruire il gioco vero e proprio. Quando si è pronti si può procedere a sviluppare un primo prototipo giocabile partendo dal loop base (semina → raccolta → primo ordine).
