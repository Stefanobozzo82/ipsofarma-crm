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
- [ ] **5. Backtesting** — validazione storica pre-condizione per operare
- [ ] **6. Execution layer** — paper trading di default, reale isolato e dietro conferma
- [ ] **7. Dashboard/report** — stato portafoglio, storico, motivazioni, alert

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
│   └── strategies.yaml    # regole/parametri delle strategie per asset class
├── src/trading_system/
│   ├── common/             # modelli dati condivisi, enum, logging, eccezioni
│   ├── data_ingestion/     # MODULO 1 — connettori dati + normalizzazione + storage
│   ├── strategy_engine/    # MODULO 2 — regole per asset class + score di confidenza
│   ├── risk_management/    # MODULO 3 — position sizing, limiti, stop-loss, filtro volatilità
│   ├── portfolio/          # MODULO 4 — allocazione per profilo di rischio, ribilanciamento
│   ├── backtesting/        # MODULO 5 — non ancora implementato
│   ├── execution/          # MODULO 6 — non ancora implementato (paper/ e live/ separati)
│   └── api/                # MODULO 7 — dashboard FastAPI, non ancora implementato
├── scripts/
│   ├── fetch_sample_data.py         # demo CLI: scarica ed effettua l'upsert di dati reali
│   ├── generate_sample_signals.py   # demo CLI: genera segnali dai dati storicizzati
│   ├── evaluate_sample_risk.py      # demo CLI: valuta i segnali contro i limiti di rischio
│   └── allocate_sample_portfolio.py # demo CLI: arbitraggio di budget + ribilanciamento
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

Le seguenti credenziali **non sono ancora richieste** ma serviranno nei
moduli successivi — te le chiederò esplicitamente quando arriveremo lì,
non le invento né le lascio in placeholder attivi:

| Credenziale | Modulo | Note |
|---|---|---|
| Alpaca `API_KEY` / `API_SECRET` (o Interactive Brokers) | 6 — Execution (azioni/ETF) | serve anche per il paper trading Alpaca |
| API key exchange crypto (es. Binance, Kraken) | 6 — Execution (crypto, ordini reali) | non serve per i soli dati OHLCV |
| Polygon.io / Alpha Vantage API key | 1 — Data ingestion (fonte dati alternativa/di backup) | opzionale, solo se vuoi affiancarle a yfinance |
| `DATABASE_URL` (Postgres) | tutti | opzionale, default SQLite locale |

Vedi `.env.example` per l'elenco completo con commenti.

## Uso rapido (demo data ingestion + strategy engine + risk management + portfolio allocator)

```bash
python scripts/fetch_sample_data.py          # modulo 1: scarica e storicizza i dati
python scripts/generate_sample_signals.py    # modulo 2: genera segnali dai dati storicizzati
python scripts/evaluate_sample_risk.py       # modulo 3: valuta i segnali contro i limiti di rischio
python scripts/allocate_sample_portfolio.py  # modulo 4: arbitraggio di budget + ribilanciamento
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
raggiungere il profilo di allocazione attivo da zero.

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

I moduli 1-4 sono stati validati end-to-end con dati reali per la parte
crypto (Kraken → data ingestion → strategy engine → risk management →
portfolio allocator, inclusa la verifica che il rifiuto di un asset troppo
volatile da parte del modulo 3 si propaghi correttamente come "non idoneo
per l'allocazione" nel modulo 4, e che il ribilanciamento da un conto vuoto
proponga correttamente di aprire posizioni verso i target del profilo
attivo) e con una suite di test unitari (mock/dati sintetici, nessuna rete)
per tutti e quattro.

## Test

```bash
pytest
```

I test usano mock/dati sintetici deterministici (nessuna chiamata di rete
reale durante `pytest`); gli script `fetch_sample_data.py`,
`generate_sample_signals.py`, `evaluate_sample_risk.py` ed
`allocate_sample_portfolio.py` invece effettuano
operazioni reali (rete per il primo, lettura del DB locale per gli altri
tre) per verifica manuale end-to-end.
