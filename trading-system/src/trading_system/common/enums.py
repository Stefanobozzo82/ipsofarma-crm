"""Enumerazioni condivise da tutti i moduli."""

from __future__ import annotations

from enum import Enum


class AssetClass(str, Enum):
    """Classe di asset. Le regole di strategia, rischio e allocazione sono
    sempre definite per singola asset class, mai in modo generico."""

    EQUITY = "equity"
    ETF = "etf"
    CRYPTO = "crypto"


class Timeframe(str, Enum):
    """Timeframe delle barre OHLCV, nello schema comune a tutte le fonti dati."""

    MIN_1 = "1m"
    MIN_5 = "5m"
    MIN_15 = "15m"
    HOUR_1 = "1h"
    DAY_1 = "1d"
    WEEK_1 = "1w"


class SignalAction(str, Enum):
    """Azione suggerita da un segnale generato dallo strategy engine (modulo 2)."""

    BUY = "buy"
    SELL = "sell"
    HOLD = "hold"


class OrderSide(str, Enum):
    """Lato di un ordine (modulo 6 — execution)."""

    BUY = "buy"
    SELL = "sell"


class OrderStatus(str, Enum):
    """Stato di un ordine nel suo ciclo di vita (modulo 6 — execution)."""

    PENDING = "pending"
    SUBMITTED = "submitted"
    FILLED = "filled"
    PARTIALLY_FILLED = "partially_filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class ExecutionMode(str, Enum):
    """Modalità di esecuzione. PAPER è il default per l'intero sistema."""

    PAPER = "paper"
    LIVE = "live"
