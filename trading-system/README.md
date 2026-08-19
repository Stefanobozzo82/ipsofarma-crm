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
- [ ] **2. Strategy engine** — regole configurabili per asset class + score di confidenza
- [ ] **3. Risk management** — position sizing, limiti per asset class, stop-loss
- [ ] **4. Portfolio allocator** — distribuzione del capitale tra asset class
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
│   └── assets.yaml        # watchlist per asset class (esempio, da personalizzare)
├── src/trading_system/
│   ├── common/             # modelli dati condivisi, enum, logging, eccezioni
│   ├── data_ingestion/     # MODULO 1 — connettori dati + normalizzazione + storage
│   ├── strategy_engine/    # MODULO 2 — non ancora implementato
│   ├── risk_management/    # MODULO 3 — non ancora implementato
│   ├── portfolio/          # MODULO 4 — non ancora implementato
│   ├── backtesting/        # MODULO 5 — non ancora implementato
│   ├── execution/          # MODULO 6 — non ancora implementato (paper/ e live/ separati)
│   └── api/                # MODULO 7 — dashboard FastAPI, non ancora implementato
├── scripts/
│   └── fetch_sample_data.py  # demo CLI: scarica ed effettua l'upsert di dati reali
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

## Uso rapido (demo data ingestion)

```bash
python scripts/fetch_sample_data.py
```

Scarica alcune barre storiche daily per un'azione ed un ETF di esempio
(yfinance) e per le coppie crypto di esempio (ccxt/Kraken), le normalizza
nello schema comune e le salva nel database SQLite locale
(`data/trading_system.db`).

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

Questo modulo è stato validato: end-to-end con dati reali per la parte
crypto (Kraken) e con una suite di test unitari (mock, nessuna rete) per
entrambi i connettori — vedi sezione Test.

## Test

```bash
pytest
```

I test sui connettori dati usano mock delle chiamate di rete (nessuna
chiamata reale durante `pytest`); lo script `fetch_sample_data.py` invece
effettua chiamate reali per verifica manuale end-to-end.
