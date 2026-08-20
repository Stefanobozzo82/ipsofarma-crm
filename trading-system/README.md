# Trading System — Analisi di mercato e trading semi-automatico multi-asset

Sistema per l'analisi di mercati finanziari eterogenei (azioni, ETF, crypto)
che raccoglie dati da più fonti, genera segnali operativi con regole
quantitative specifiche per asset class, e — solo dopo backtest positivo e
limiti di rischio impostati esplicitamente dall'utente — può eseguire
operazioni a basso rischio in modalità paper trading o (in un secondo
momento, dietro conferma esplicita) con denaro reale.

**Ogni decisione del sistema deve essere tracciabile e spiegabile**: ogni
segnale, ogni scelta di allocazione e ogni ordine porta con sé la motivazione
che lo ha generato, loggata e persistita.

## Stato del progetto

Sviluppo modulare, in quest'ordine. Le caselle segnano cosa è già
implementato in questo repository.

- [x] **0. Architettura e struttura base** — questo commit
- [x] **1. Data ingestion** — connettori azioni/ETF (yfinance) e crypto (ccxt),
      normalizzazione dati comune, persistenza storicizzata
- [x] **2. Strategy engine** — regole configurabili per asset class (media
      mobile per ETF, RSI + volatilità per crypto, media mobile + filtro
      fondamentale per azioni), ognuna con score di confidenza
- [x] **3. Risk management** — position sizing, limiti per asset class (crypto
      sempre più stringenti, validato a runtime), stop-loss, filtro di
      volatilità per categoria
- [x] **4. Portfolio allocator** — distribuzione del capitale tra asset class
      per profilo di rischio, arbitraggio di budget tra segnali concorrenti,
      ribilanciamento
- [x] **5. Backtesting** — simulazione walk-forward con strategy engine e
      risk manager reali, metriche di rendimento/drawdown/Sharpe per asset
      class e aggregate, criteri di eleggibilità al trading live
- [x] **6. Execution layer** — paper trading di default, reale isolato in
      `execution/live/` dietro un gate a doppio percorso (conferma esplicita
      o periodo di validazione), broker diversi per asset class
- [x] **7. Dashboard/report** — API FastAPI di sola lettura: stato del
      portafoglio aggregato e per categoria, storico operazioni con
      motivazione di ogni trade, alert su anomalie

Tutti i moduli pianificati sono implementati. I prossimi passi naturali
sono di prodotto/operativi, non architetturali: compilare
`config/risk_limits.yaml` con i tuoi limiti reali, far girare gli script di
raccolta dati/segnali/backtest su un orizzonte più ampio, validare in paper
trading, e — solo quando vuoi — attivare l'esecuzione live con le tue
credenziali.

## Principi guida (vincoli non negoziabili)

1. **Nessuna operazione reale senza backtest positivo** e senza limiti di
   rischio impostati esplicitamente per ogni asset class (modulo 3).
2. **Paper trading di default.** L'esecuzione con denaro reale vive in un
   modulo isolato (`execution/live/`, non ancora creato) che richiede
   conferma esplicita e — quando implementato — un periodo di validazione
   in paper trading.
3. **Le crypto sono sempre trattate come asset ad alto rischio**: i limiti
   di esposizione su crypto (modulo 3) saranno sempre più stringenti di
   quelli su azioni/ETF, indipendentemente da come si comporta il mercato.
4. **Tracciabilità.** Log dettagliati su ogni modulo; le decisioni operative
   (segnali, allocazioni, ordini) sono persistite con la motivazione che le
   ha generate, non solo con l'esito.
5. **Test unitari obbligatori** sui moduli critici: risk management,
   execution, portfolio allocator (e, dove opportuno, sugli altri moduli).

## Struttura del progetto

```
trading-system/
├── config/
│   ├── settings.py        # configurazione centrale (env vars via pydantic-settings)
│   ├── risk_limits.yaml   # limiti di rischio per asset class — DA COMPILARE dall'utente
│   ├── assets.yaml        # watchlist per asset class (esempio, da personalizzare)
│   ├── strategies.yaml    # regole/parametri delle strategie per asset class
│   ├── backtesting.yaml   # parametri di simulazione + criteri di eleggibilità al live
│   └── execution.yaml     # modalità paper/live, broker per asset class, gate verso il live
├── src/trading_system/
│   ├── common/             # modelli dati condivisi, enum, logging, eccezioni
│   ├── data_ingestion/     # MODULO 1 — connettori dati + normalizzazione + storage
│   ├── strategy_engine/    # MODULO 2 — regole per asset class + score di confidenza
│   ├── risk_management/    # MODULO 3 — position sizing, limiti, stop-loss, filtro volatilità
│   ├── portfolio/          # MODULO 4 — allocazione per profilo di rischio, ribilanciamento
│   ├── backtesting/        # MODULO 5 — simulazione walk-forward, metriche, eleggibilità
│   ├── execution/          # MODULO 6 — paper trading + execution.live/ isolato (Alpaca, ccxt)
│   └── api/                # MODULO 7 — dashboard FastAPI (sola lettura)
├── scripts/
│   ├── fetch_sample_data.py          # demo CLI: scarica ed effettua l'upsert di dati reali
│   ├── generate_sample_signals.py    # demo CLI: genera segnali dai dati storicizzati
│   ├── evaluate_sample_risk.py       # demo CLI: valuta i segnali contro i limiti di rischio
│   ├── allocate_sample_portfolio.py  # demo CLI: arbitraggio di budget + ribilanciamento
│   ├── backtest_sample_strategy.py   # demo CLI: backtest walk-forward + eleggibilità + aggregati
│   └── execute_sample_decisions.py   # demo CLI: esecuzione paper trading dell'intera pipeline
├── tests/                  # test unitari (pytest)
├── data/                   # DB SQLite locale (gitignored)
├── logs/                   # log applicativi (gitignored)
├── .env.example            # variabili d'ambiente necessarie (nessuna chiave inclusa)
└── requirements.txt
```

### Perché questa struttura

- **`common/`** contiene i tipi condivisi da tutti i moduli (`AssetClass`,
  `Instrument`, `MarketBar`, `Signal`, `Order`, ...) così che strategy
  engine, risk management, portfolio e execution parlino tutti lo stesso
  "linguaggio" fin dall'inizio, anche se implementati in momenti diversi.
- **Ogni asset class ha un connettore dati separato** (`EquityYFinanceSource`,
  `CryptoCCXTSource`) ma tutti implementano la stessa interfaccia astratta
  (`DataSource`) e restituiscono lo stesso schema normalizzato: i moduli a
  valle (strategy engine, backtesting) non devono sapere da dove vengono i
  dati.
- **`config/risk_limits.yaml` e `config/assets.yaml`** sono file di
  configurazione dichiarativi, non codice: i limiti di rischio per asset
  class devono poter essere rivisti/auditati senza leggere Python, e il
  modulo di risk management (3) rifiuterà di operare se questo file non è
  stato compilato esplicitamente.
- **`execution/` sarà diviso in `paper/` e `live/`** quando implementato: il
  modulo `live/` richiederà una conferma esplicita a runtime e non sarà mai
  eseguito di default.

## Modulo 2 — Strategy engine

Ogni strategia implementa la stessa interfaccia (`Strategy.generate_signal`)
e produce un `Signal` con `action` (BUY/SELL/HOLD), `confidence` in [0, 1] e
`reason` testuale: nessun segnale esiste senza una motivazione leggibile.
Le regole sono specifiche per asset class, come da specifica di prodotto:

| Asset class | Strategia | Regola |
|---|---|---|
| ETF | `MovingAverageCrossoverStrategy` | SMA corta vs SMA lunga sul prezzo di chiusura: corta sopra lunga = trend rialzista (BUY), sotto = ribassista (SELL); confidenza proporzionale allo scostamento tra le due medie. |
| Crypto | `RSIVolatilityStrategy` | RSI in ipervenduto/ipercomprato = BUY/SELL; **la volatilità annualizzata ha priorità sul segnale tecnico** — sopra soglia, il segnale è sempre forzato a HOLD, in linea con il vincolo "crypto = rischio alto a prescindere". |
| Azioni | `EquityMovingAverageFundamentalsStrategy` | Stessa base tecnica (SMA) degli ETF, ma un punteggio fondamentale (P/E, ROE, debito/equity, crescita ricavi) può **vetare** un segnale BUY tecnico se i bilanci sono deboli, o rafforzarne/indebolirne la confidenza se sono nella norma. Se i fondamentali non sono disponibili, il segnale resta tecnico e lo dichiara esplicitamente. |

I parametri di ogni strategia (finestre delle medie, soglie RSI, soglie di
volatilità, soglie fondamentali) sono in `config/strategies.yaml` — non nel
codice — con lo stesso principio dichiarativo di `risk_limits.yaml`. Il
"rebalancing" citato per gli ETF nella specifica è una decisione di
allocazione del capitale (quanto spostare quando il segnale scatta), di
competenza del modulo 4 (portfolio allocator), non di questo modulo.

`StrategyEngine` orchestra le strategie abilitate per asset class:

```python
from trading_system.strategy_engine import StrategyEngine
from trading_system.common.enums import AssetClass

engine = StrategyEngine()  # legge config/strategies.yaml
signals = engine.generate_signals("SPY", AssetClass.ETF, bars_df)
```

dove `bars_df` è un DataFrame con almeno le colonne `timestamp` e `close`
(lo stesso schema prodotto dal modulo 1). Un errore in una singola
strategia viene loggato e non blocca le altre.

**Importante**: lo strategy engine produce segnali, non ordini. Nessun
segnale (nemmeno BUY con confidenza 1.0) autorizza un'operazione da solo:
il modulo 3 (risk management) deve validarlo contro i limiti di rischio
prima che diventi un ordine.

## Modulo 3 — Risk management

Trasforma un `Signal` in un `RiskDecision` (`approved: bool` + motivazione
completa, sempre), applicando in ordine:

1. **Limiti compilati ed abilitati.** `config/risk_limits.yaml` deve avere
   `enabled: true` a livello globale e per l'asset class del segnale, con
   tutti i valori numerici compilati (niente `null`). Il file distribuito
   nel repo è disabilitato di proposito: il `RiskManager` si rifiuta di
   partire (`ConfigurationError`) finché non lo compili tu esplicitamente.
2. **Vincolo "crypto sempre più stringente".** Validato a runtime, non solo
   suggerito nei commenti: se `crypto.max_portfolio_pct`,
   `crypto.stop_loss_pct` o `crypto.max_volatility_annualized` non sono
   più stringenti di quelli di ogni asset class abilitata (azioni, ETF), il
   caricamento della configurazione fallisce.
3. **Filtro di volatilità/rischio per categoria.** Indipendente da eventuali
   filtri di volatilità interni a una strategia (modulo 2): è un floor di
   rischio di portafoglio che si applica sempre, qualunque sia la
   strategia che ha generato il segnale.
4. **Position sizing risk-based**, scalato dalla confidenza del segnale e
   vincolato dal più stretto tra: rischio massimo per trade, tetto per
   singolo strumento, tetto di esposizione residua per l'asset class.
5. **Stop-loss**, calcolato dal prezzo di entrata e dalla percentuale
   configurata per l'asset class.

```python
from trading_system.risk_management import RiskManager

risk_manager = RiskManager()  # legge e valida config/risk_limits.yaml
decision = risk_manager.evaluate_signal(signal, bars_df, account_equity=100_000.0)
if decision.approved:
    ...  # solo qui un ordine può essere costruito (modulo 6, non ancora implementato)
```

**Importante**: come per lo strategy engine, un `RiskDecision` approvato
non esegue nulla da solo — è il contratto che il modulo 6 (execution, non
ancora implementato) userà per costruire un ordine, sempre in paper trading
salvo conferma esplicita per il reale.

## Modulo 4 — Portfolio allocator

Decide come distribuire il capitale tra le tre asset class in base al
rischio complessivo desiderato. `config/portfolio.yaml` definisce profili
di allocazione (`conservative`/`balanced`/`aggressive`, personalizzabili) —
ognuno è un **obiettivo/preferenza**, non un tetto di sicurezza: al
caricamento, ogni profilo viene validato contro i tetti reali del modulo 3
(`max_portfolio_pct`) e il caricamento fallisce se un profilo li supera.
Non puoi usare questo file per aggirare i limiti di rischio, solo per
starne più prudentemente sotto.

Due responsabilità distinte:

1. **Arbitraggio di budget** (`allocate`): il modulo 3 approva un segnale
   contro i limiti *per strumento/asset class*; qui si verifica in più che
   ci sia budget residuo nel *target di portafoglio* — se più `RiskDecision`
   BUY concorrono sullo stesso budget nella stessa asset class, vengono
   allocate in ordine di confidenza decrescente finché il budget non si
   esaurisce (le eccedenti vengono ridotte o rifiutate, sempre con
   motivazione). Le vendite riducono l'esposizione e non consumano mai
   budget: passano sempre.
2. **Ribilanciamento** (`check_rebalance`): confronta il peso attuale di
   ogni asset class con il target e produce `RebalanceAction` quando lo
   scostamento supera `rebalance_threshold_pct` — anche senza alcun nuovo
   segnale, perché il solo movimento dei prezzi può scostare il portafoglio
   dal profilo scelto. È qui che vive la logica di "rebalancing" citata per
   gli ETF nella specifica di prodotto, generalizzata a tutte le asset class
   (non ha senso limitarla a una sola).

```python
from trading_system.portfolio import PortfolioAllocator, load_portfolio_config
from trading_system.risk_management import load_risk_limits

risk_limits = load_risk_limits()
allocator = PortfolioAllocator(load_portfolio_config(risk_limits))

allocation_results = allocator.allocate(risk_decisions, positions_value, total_equity)
rebalance_actions = allocator.check_rebalance(positions_value, total_equity)
```

## Modulo 5 — Backtesting

Verifica ogni strategia su dati storici prima che possa operare con denaro
reale, per vincolo di prodotto.

**Decisione architetturale**: `BacktestEngine` non reimplementa le
strategie in un motore esterno (backtrader/vectorbt, citati nello stack ma
pensati per possedere l'intera logica di trading al loro interno):
orchestra invece **le stesse istanze** di `StrategyEngine` (modulo 2) e
`RiskManager` (modulo 3) che opererebbero dal vivo, walk-forward su dati
storici. Backtestare una reimplementazione parallela non garantirebbe che
"backtest positivo" dica qualcosa sulla logica che poi opera davvero — è
la ragione d'essere di questo modulo. `backtrader`/`vectorbt` restano nello
stack come opzione per un motore di backtest indipendente da affiancare in
futuro (es. per confrontare risultati), non sono stati scartati, solo non
sono l'impianto di default.

Ad ogni barra il motore vede solo `bars.iloc[:i+1]`: nessun look-ahead,
verificato esplicitamente nei test (aggiungere barre future non deve mai
cambiare l'equity già simulata fino a un certo giorno).

**Ambito attuale: long-only.** Un segnale BUY apre una posizione lunga; un
segnale SELL la chiude (o viene ignorato se non c'è nulla da chiudere).
Nessuna vendita allo scoperto — scelta deliberata coerente con
l'impostazione "a basso rischio" del prodotto.

```python
from trading_system.backtesting import BacktestEngine, evaluate_eligibility, load_backtesting_config
from trading_system.risk_management import RiskManager
from trading_system.strategy_engine import StrategyEngine

config = load_backtesting_config()
engine = BacktestEngine(config, StrategyEngine(), RiskManager())

run = engine.run("SPY", AssetClass.ETF, bars_df)  # run.result: metriche; run.equity_curve: serie temporale
eligibility = evaluate_eligibility(run.result, config.eligibility)
if not eligibility.approved:
    ...  # per vincolo di prodotto, il modulo 6 (execution) deve rifiutarsi di operare live
```

`aggregate_metrics` combina più `BacktestRun` per asset class (o sul
totale) sommando le curve di equity — assumendo capitali indipendenti in
parallelo per simbolo, non l'arbitraggio di budget condiviso del modulo 4
(quella è gestione del capitale *live*, non backtest storico multi-simbolo;
la semplificazione è dichiarata esplicitamente nel codice).

## Modulo 6 — Execution layer

Trasforma una `AllocationDecision` (modulo 4) in un `Order`. **Paper
trading di default, sempre** (`config/execution.yaml: mode: paper`):
nessuna credenziale richiesta, cassa e posizioni simulate e persistite
(sopravvivono tra esecuzioni successive — è ciò che rende possibile un
periodo di validazione, non solo una simulazione usa e getta). Niente
vendite allo scoperto: coerente con il motore di backtest (modulo 5) e con
l'impostazione "a basso rischio" del prodotto.

**L'esecuzione con denaro reale vive isolata in `execution/live/`**
(`AlpacaBroker` per azioni/ETF, `CCXTBroker` per crypto) e non viene mai
usata implicitamente. Anche con `mode: live` in configurazione, ogni
singolo ordine passa per `LiveTradingGate`, che richiede **sempre** un
backtest positivo e non scaduto (modulo 5, `max_backtest_age_days`), più
**almeno una** tra:

- **conferma esplicita a runtime** — mai automatica, mai letta da un file:
  va passata esplicitamente (`explicit_confirmation=True`) *e*
  `LIVE_TRADING_ENABLED=true` nell'ambiente, entrambe necessarie;
- **periodo di validazione in paper trading superato** — numero minimo di
  trade paper riempiti e giorni minimi dal primo, sullo stesso
  simbolo/strategia (`config/execution.yaml: live_gate`).

Se il gate non approva, o se il broker live non è disponibile (credenziali
mancanti — mai inventate, vedi tabella sotto), l'ordine **viene eseguito in
paper**, non rifiutato in silenzio e mai eseguito live senza autorizzazione.
Ogni ordine, paper o live, viene registrato in un unico storico
(`ExecutionRepository`), per una tracciabilità unificata.

```python
from trading_system.execution import ExecutionManager, ExecutionRepository, load_execution_config

manager = ExecutionManager(load_execution_config(), ExecutionRepository(engine), price_provider)
order = manager.execute(allocation_decision, eligibility=backtest_eligibility, explicit_confirmation=False)
# order.mode dice sempre se è stato eseguito in paper o in live — mai ambiguo
```

**Nota sui broker live**: `AlpacaBroker` e `CCXTBroker` sono implementati
contro le interfacce reali (`alpaca-py`, `ccxt` autenticato) verificate per
corrispondenza, ma non testati end-to-end con credenziali vere in questo
ambiente di sviluppo — nessuna credenziale è stata inventata. Testali con
le tue chiavi prima di autorizzare qualunque operazione reale.

## Modulo 7 — Dashboard/report

API FastAPI **di sola lettura** sopra ciò che i moduli 1-6 hanno già
prodotto: nessun endpoint genera segnali, valuta rischio, alloca budget o
esegue ordini — quella logica resta negli script/scheduler, non nella
dashboard.

| Endpoint | Cosa mostra |
|---|---|
| `GET /health` | stato del servizio + se `risk_limits`/`portfolio_config` sono compilati |
| `GET /portfolio` | cassa, posizioni valorizzate ai prezzi correnti, aggregato per asset class (peso attuale vs target) |
| `GET /orders` | storico ordini (paper e live), più recenti prima, **ognuno con la propria motivazione** (`?symbol=`, `?limit=`) |
| `GET /alerts` | anomalie: scostamento dal profilo target, posizioni vicine/oltre lo stop-loss teorico, ordini ripetutamente rifiutati |

Avvio:

```bash
uvicorn trading_system.api.main:app --reload
# poi, ad es.: curl http://localhost:8000/portfolio
```

Se `config/risk_limits.yaml`/`config/portfolio.yaml` non sono ancora
compilati, la dashboard **resta comunque utilizzabile**: `GET /health` lo
segnala esplicitamente, le sezioni che ne dipendono (pesi target,
alert di ribilanciamento/stop-loss) restano vuote/`null` invece di far
fallire l'avvio — coerente con l'approccio "safe by default" del resto del
sistema, senza impedirti di vedere lo storico ordini nel frattempo.

`GET /portfolio` e `GET /alerts` riflettono lo stato del broker **paper**
(non esiste ancora un conto "live" da interrogare finché non attivi
l'esecuzione reale, modulo 6); il prezzo corrente di ogni posizione è
l'ultima barra storicizzata dal modulo 1, non una quotazione in tempo
reale — se non hai rilanciato di recente `fetch_sample_data.py`, può non
essere aggiornata.

## Setup

```bash
cd trading-system
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # poi compila le variabili che ti servono (vedi sotto)
```

### Credenziali — cosa serve ORA e cosa servirà DOPO

Il modulo 1 (data ingestion), così com'è oggi, **non richiede alcuna API
key**:

- **Azioni/ETF**: usa [`yfinance`](https://github.com/ranaroussi/yfinance),
  dati pubblici senza autenticazione.
- **Crypto**: usa [`ccxt`](https://github.com/ccxt/ccxt) in modalità
  pubblica (`fetch_ohlcv`), configurabile su qualunque exchange supportato
  (Binance, Kraken, ...); nessuna API key richiesta per i dati di mercato.
  La watchlist demo (`config/assets.yaml`) usa Kraken come esempio: Binance
  applica blocchi geografici (HTTP 451) su alcune giurisdizioni/hosting, per
  cui se operi da una zona soggetta a restrizioni ti conviene comunque un
  altro exchange.

Il modulo 6 (execution) è implementato, ma **paper trading resta il default
e non richiede alcuna credenziale**: usa un broker simulato interno, non
Alpaca né un exchange reale. Le credenziali sotto servono solo se e quando
vorrai attivare l'esecuzione **live** — te le chiederò esplicitamente
quando deciderai di farlo, non le invento né le lascio in placeholder
attivi:

| Credenziale | Modulo | Note |
|---|---|---|
| Alpaca `API_KEY` / `API_SECRET` (o Interactive Brokers) | 6 — Execution live (azioni/ETF) | richiesta solo da `execution.live.AlpacaBroker`, non dal paper trading di default |
| API key exchange crypto (es. Binance, Kraken) | 6 — Execution live (crypto, ordini reali) | richiesta solo da `execution.live.CCXTBroker`; non serve per i soli dati OHLCV (modulo 1) |
| Polygon.io / Alpha Vantage API key | 1 — Data ingestion (fonte dati alternativa/di backup) | opzionale, solo se vuoi affiancarle a yfinance |
| `DATABASE_URL` (Postgres) | tutti | opzionale, default SQLite locale |

Vedi `.env.example` per l'elenco completo con commenti.

## Uso rapido (demo di tutti i moduli 1-7)

```bash
python scripts/fetch_sample_data.py          # modulo 1: scarica e storicizza i dati
python scripts/generate_sample_signals.py    # modulo 2: genera segnali dai dati storicizzati
python scripts/evaluate_sample_risk.py       # modulo 3: valuta i segnali contro i limiti di rischio
python scripts/allocate_sample_portfolio.py  # modulo 4: arbitraggio di budget + ribilanciamento
python scripts/backtest_sample_strategy.py   # modulo 5: backtest walk-forward + eleggibilità
python scripts/execute_sample_decisions.py   # modulo 6: esecuzione paper trading dell'intera pipeline
uvicorn trading_system.api.main:app --reload # modulo 7: dashboard su quanto prodotto sopra
```

Il primo scarica alcune barre storiche daily per un'azione ed un ETF di
esempio (yfinance) e per le coppie crypto di esempio (ccxt/Kraken), le
normalizza nello schema comune e le salva nel database SQLite locale
(`data/trading_system.db`). Il secondo legge quei dati, esegue le strategie
abilitate per ogni simbolo/asset class e stampa i segnali generati con la
loro motivazione (recuperando anche i fondamentali per le azioni, se
disponibili). Il terzo valuta ogni segnale con il risk manager: finché non
compili `config/risk_limits.yaml`, lo segnala esplicitamente e usa dei
limiti di esempio tenuti solo in memoria, per farti comunque vedere la
pipeline completa in azione senza autorizzare nulla di reale. Il quarto
simula un conto senza posizioni aperte e mostra sia l'arbitraggio di budget
sulle `RiskDecision` approvate sia i suggerimenti di ribilanciamento per
raggiungere il profilo di allocazione attivo da zero. Il quinto esegue un
backtest walk-forward per ogni simbolo con dati sufficienti, stampa
metriche/eleggibilità per simbolo e le aggregate per asset class e sul
totale — nota che un solo trade su un periodo di due anni (esito plausibile
e onesto sui dati storici reali) viene correttamente segnalato come "non
idoneo" per il numero di trade insufficiente: è il comportamento di
sicurezza voluto, non un difetto della demo. Il sesto esegue l'intera
pipeline (segnali -> rischio -> allocazione) e invia il risultato
all'`ExecutionManager`, sempre in paper trading: stampa gli ordini
riempiuti/rifiutati, la cassa residua e le posizioni aperte del conto
simulato. Il settimo avvia la dashboard: `GET /portfolio` mostra cassa e
posizioni valorizzate ai prezzi correnti (aggregate per asset class),
`GET /orders` lo storico ordini con la motivazione di ognuno, `GET /alerts`
gli scostamenti dal profilo target e le posizioni vicine/oltre lo
stop-loss teorico — vuoti finché non compili `config/risk_limits.yaml`/
`config/portfolio.yaml`, non un errore.

### Nota su reti aziendali con TLS-inspection

Se lavori dietro un proxy aziendale che re-termina il TLS (comune in ambienti
enterprise/CI sandboxati), potresti incontrare errori di certificato:

- **ccxt/requests**: imposta `REQUESTS_CA_BUNDLE` (o `CURL_CA_BUNDLE`) con il
  path del CA bundle aziendale. Se l'errore persiste nonostante la variabile
  d'ambiente, è perché la libreria usa il bundle di `certifi` invece di
  leggere le variabili d'ambiente/il trust store di sistema: in quel caso
  l'unica soluzione affidabile è aggiungere il certificato aziendale al
  bundle di certifi stesso (`cat la-tua-ca.pem >> "$(python -m certifi)"`).
- **yfinance**: dalla versione che usa `curl_cffi` per impersonare un
  browser (necessario per superare le protezioni anti-bot di Yahoo Finance),
  la libreria fa il proprio handshake TLS a basso livello e può risultare
  incompatibile con un proxy che re-termina il TLS, con un semplice reset di
  connessione invece di un errore di certificato leggibile. Non c'è un modo
  pulito per aggirarlo lato applicazione: verifica di poter raggiungere
  `query1.finance.yahoo.com` direttamente (fuori da eventuali proxy di
  ispezione TLS) prima di aprire un bug sul connettore.

Tutti i sette moduli sono stati validati end-to-end con dati reali per la
parte crypto (Kraken → data ingestion → strategy engine → risk management →
portfolio allocator → backtesting → execution → dashboard, inclusa la
verifica che il rifiuto di un asset troppo volatile da parte del modulo 3
si propaghi correttamente come "non idoneo" fino all'esecuzione e sia poi
visibile nello storico ordini della dashboard, che il ribilanciamento da un
conto vuoto proponga correttamente di aprire posizioni verso i target del
profilo attivo, che il backtest su ~2 anni di dati BTC/ETH produca metriche
ed eleggibilità coerenti, che un ordine paper con prezzo di mercato reale
aggiorni correttamente cassa e posizioni persistite, e che `GET /portfolio`
e `GET /alerts` riflettano quello stato reale — inclusi gli alert di
scostamento dal profilo target generati correttamente su un portafoglio
prevalentemente in cash) e con una suite di test unitari (mock/dati
sintetici, nessuna rete) per tutti e sette, inclusa una verifica esplicita
di assenza di look-ahead bias nel motore di backtest e del doppio percorso
"conferma esplicita / periodo di validazione" del gate verso il live.

Nota tecnica emersa proprio testando la dashboard: SQLite in-memory
(`sqlite:///:memory:`) assegna di default una connessione per thread — un
server ASGI (FastAPI/uvicorn) gestisce le richieste in thread separati da
quello che ha creato lo schema, quindi vedrebbe un database vuoto senza
`StaticPool`. Corretto in `create_sqlite_engine` sia per `data_ingestion`
che per `execution` (irrilevante per il DB su file usato in produzione,
essenziale per i test in memoria di un'app FastAPI).

## Test

```bash
pytest
```

I test usano mock/dati sintetici deterministici (nessuna chiamata di rete
reale durante `pytest`); gli script `fetch_sample_data.py`,
`generate_sample_signals.py`, `evaluate_sample_risk.py`,
`allocate_sample_portfolio.py`, `backtest_sample_strategy.py` ed
`execute_sample_decisions.py` invece effettuano operazioni reali (rete per
il primo, lettura del DB locale per gli altri cinque) per verifica manuale
end-to-end; la dashboard (modulo 7) si avvia con `uvicorn` (vedi sopra) e
legge lo stesso DB locale.
