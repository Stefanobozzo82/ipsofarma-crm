"""Modelli dati condivisi tra i moduli.

Definire questi tipi fin dall'inizio permette a moduli sviluppati in momenti
diversi (data ingestion oggi, strategy engine/risk/execution più avanti) di
parlare lo stesso linguaggio. `Instrument` e `MarketBar` sono usati dal
modulo 1 (data ingestion), `Signal` dal modulo 2 (strategy engine),
`RiskDecision` dal modulo 3 (risk management), `AllocationDecision`/
`RebalanceAction`/`Position` dal modulo 4 (portfolio allocator) e
`BacktestTrade`/`BacktestResult`/`BacktestEligibility` dal modulo 5
(backtesting), tutti già implementati. `Order` è qui come contratto per il
modulo 6 (execution, non ancora implementato) e può essere esteso quando
quel modulo verrà costruito.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from trading_system.common.enums import (
    AssetClass,
    OrderSide,
    OrderStatus,
    SignalAction,
    Timeframe,
)


class Instrument(BaseModel):
    """Uno strumento finanziario tracciato dal sistema, di qualunque asset class."""

    model_config = ConfigDict(frozen=True)

    symbol: str
    asset_class: AssetClass
    exchange: str | None = None  # es. "binance" per crypto, "NASDAQ" per equity
    currency: str = "USD"
    name: str | None = None


class MarketBar(BaseModel):
    """Una barra OHLCV normalizzata, indipendentemente dalla fonte dati.

    Questo è lo schema comune prodotto da tutti i connettori del modulo di
    data ingestion (`DataSource.get_historical_bars`), a prescindere dalla
    fonte (yfinance, ccxt, o altre aggiunte in futuro).
    """

    model_config = ConfigDict(frozen=True)

    symbol: str
    asset_class: AssetClass
    timeframe: Timeframe
    timestamp: datetime  # timezone-aware, UTC
    open: float
    high: float
    low: float
    close: float
    volume: float
    source: str  # es. "yfinance", "ccxt.binance"


class Signal(BaseModel):
    """Segnale operativo generato dallo strategy engine (modulo 2).

    `confidence` è lo score di confidenza richiesto dalla specifica
    (0.0 - 1.0). `reason` è la motivazione testuale/tracciabile del segnale:
    nessun segnale dovrebbe esistere senza una spiegazione leggibile.
    """

    symbol: str
    asset_class: AssetClass
    action: SignalAction
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str
    generated_at: datetime
    strategy_name: str


class RiskDecision(BaseModel):
    """Esito della valutazione di un `Signal` da parte del risk management (modulo 3).

    È il contratto tra strategy engine, risk management e i moduli a valle
    (portfolio allocator, execution): un `Signal` da solo non autorizza mai
    un'operazione, un `RiskDecision` con `approved=True` sì. `reason` deve
    sempre spiegare l'esito, sia in caso di approvazione che di rifiuto —
    incluso *quali* controlli sono stati superati, non solo il verdetto
    finale.
    """

    symbol: str
    asset_class: AssetClass
    approved: bool
    action: SignalAction  # HOLD se rifiutato o se il segnale originale era HOLD
    quantity: float = 0.0
    entry_price: float | None = None
    stop_loss_price: float | None = None
    reason: str
    signal_confidence: float = Field(ge=0.0, le=1.0)
    evaluated_at: datetime


class Position(BaseModel):
    """Una posizione aperta nel portafoglio (modulo 4 — portfolio allocator)."""

    symbol: str
    asset_class: AssetClass
    quantity: float
    average_entry_price: float


class AllocationDecision(BaseModel):
    """Esito dell'arbitraggio di budget del portfolio allocator (modulo 4) su una `RiskDecision`.

    Il modulo 3 approva un segnale contro i limiti di rischio *per
    strumento/asset class*; il modulo 4 verifica in più che ci sia budget
    residuo nel profilo di allocazione target *di portafoglio* (che può
    essere più prudente del tetto di sicurezza) e, se più segnali
    concorrono sullo stesso budget, decide quali eseguire per intero, quali
    ridurre e quali scartare — sempre spiegando perché.
    """

    symbol: str
    asset_class: AssetClass
    approved: bool
    action: SignalAction
    quantity: float = 0.0  # quantità finale, eventualmente ridotta rispetto alla RiskDecision di origine
    original_quantity: float = 0.0  # quantità approvata dal modulo 3, prima dell'arbitraggio di budget
    reason: str
    evaluated_at: datetime


class RebalanceAction(BaseModel):
    """Segnalazione di ribilanciamento tra asset class (modulo 4 — portfolio allocator).

    A differenza di `Signal`/`RiskDecision` (per singolo strumento), agisce
    a livello di asset class: quando il peso attuale di una categoria si
    scosta dal target oltre `rebalance_threshold_pct`
    (`config/portfolio.yaml`), propone di ridurre (`SELL`) o aumentare
    (`BUY`) l'esposizione a quella categoria — una raccomandazione di
    portafoglio, non un ordine su un singolo strumento.
    """

    asset_class: AssetClass
    action: SignalAction  # BUY = aumentare l'esposizione, SELL = ridurla
    current_pct: float
    target_pct: float
    drift_pct: float
    amount: float  # valore, in valuta di conto, dello scostamento da correggere
    reason: str
    evaluated_at: datetime


class BacktestTrade(BaseModel):
    """Un singolo trade chiuso durante un backtest (modulo 5).

    Il backtest engine è long-only (vedi modulo 5): `side` è sempre BUY,
    campo comunque esplicito per coerenza col resto del sistema e in vista
    di un'eventuale estensione futura.
    """

    symbol: str
    asset_class: AssetClass
    side: OrderSide
    entry_at: datetime
    entry_price: float
    exit_at: datetime
    exit_price: float
    quantity: float
    pnl: float  # in valuta di conto, al netto delle commissioni simulate
    pnl_pct: float
    exit_reason: str  # "stop_loss" | "segnale_sell" | "fine_periodo"


class BacktestResult(BaseModel):
    """Esito di un backtest su un singolo simbolo (modulo 5).

    Le metriche (`total_return_pct`, `cagr_pct`, `max_drawdown_pct`,
    `sharpe_ratio`, `win_rate_pct`) sono calcolate sulla curva di equity
    simulata eseguendo la *stessa* combinazione strategy engine + risk
    manager che opererebbe dal vivo, non una reimplementazione parallela:
    è la condizione perché "backtest positivo" significhi qualcosa.
    """

    symbol: str
    asset_class: AssetClass
    strategy_name: str
    start_at: datetime
    end_at: datetime
    initial_equity: float
    final_equity: float
    total_return_pct: float
    cagr_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    win_rate_pct: float
    num_trades: int
    trades: list[BacktestTrade]
    generated_at: datetime


class BacktestEligibility(BaseModel):
    """Esito della valutazione di un `BacktestResult` contro le soglie minime (modulo 5).

    Per vincolo di prodotto, il modulo 6 (execution) deve rifiutarsi di
    attivare il trading live per una strategia/simbolo il cui backtest più
    recente non ha `approved=True` qui.
    """

    symbol: str
    asset_class: AssetClass
    strategy_name: str
    approved: bool
    reason: str
    evaluated_at: datetime


class Order(BaseModel):
    """Un ordine, in paper trading o live (modulo 6 — execution).

    `mode` distingue esplicitamente paper da live: nessun ordine dovrebbe
    poter essere ambiguo su questo punto.
    """

    symbol: str
    asset_class: AssetClass
    side: OrderSide
    quantity: float
    status: OrderStatus = OrderStatus.PENDING
    reason: str  # motivazione che ha generato l'ordine (collegata al Signal)
    created_at: datetime
