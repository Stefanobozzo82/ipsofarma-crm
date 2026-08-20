"""Modulo 1 — Data ingestion.

Connettori dati separati per asset class (azioni/ETF via yfinance, crypto
via ccxt), tutti conformi alla stessa interfaccia `DataSource` e allo stesso
schema normalizzato (`trading_system.common.models.MarketBar`), più
persistenza storicizzata su database (SQLite di default, Postgres via
`DATABASE_URL`).
"""

from trading_system.data_ingestion.base import DataSource
from trading_system.data_ingestion.crypto_ccxt import CryptoCCXTSource
from trading_system.data_ingestion.equity_yfinance import EquityYFinanceSource
from trading_system.data_ingestion.storage import MarketDataRepository

__all__ = [
    "DataSource",
    "CryptoCCXTSource",
    "EquityYFinanceSource",
    "MarketDataRepository",
]
