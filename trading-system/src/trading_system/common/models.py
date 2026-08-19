"""Modelli dati condivisi tra i moduli.

Definire questi tipi fin dall'inizio permette a moduli sviluppati in momenti
diversi (data ingestion oggi, strategy engine/risk/execution più avanti) di
parlare lo stesso linguaggio. `Instrument` e `MarketBar` sono usati dal
modulo 1 (data ingestion), già implementato. `Signal`, `Order` e `Position`
sono qui come contratto per i moduli 2, 4 e 6 (non ancora implementati) e
possono essere estesi quando quei moduli verranno costruiti.
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


class Position(BaseModel):
    """Una posizione aperta nel portafoglio (modulo 4 — portfolio allocator)."""

    symbol: str
    asset_class: AssetClass
    quantity: float
    average_entry_price: float


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
