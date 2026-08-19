#!/usr/bin/env python3
"""Demo end-to-end: data ingestion (modulo 1) -> strategy engine (modulo 2).

Legge le barre già storicizzate nel DB locale (esegui prima
`fetch_sample_data.py`), le passa allo strategy engine per ogni simbolo
della watchlist e stampa i segnali generati con la loro motivazione.

Per le azioni, se possibile recupera anche i fondamentali via yfinance
(chiamata di rete reale, opzionale: se fallisce il segnale resta comunque
tecnico e lo dichiara esplicitamente nella motivazione).
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import pandas as pd
import yaml

from config.settings import ASSETS_PATH, LOGS_DIR, get_settings
from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.common.logging_config import configure_logging, get_logger
from trading_system.data_ingestion import EquityYFinanceSource, MarketDataRepository
from trading_system.data_ingestion.storage import MarketBarORM, create_sqlite_engine
from trading_system.strategy_engine import StrategyEngine

logger = get_logger(__name__)


def _bars_to_dataframe(rows: list[MarketBarORM]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["timestamp", "close"])
    return pd.DataFrame(
        [{"timestamp": r.timestamp, "close": r.close} for r in rows]
    ).sort_values("timestamp")


def load_watchlist() -> dict:
    with open(ASSETS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def main() -> None:
    settings = get_settings()
    configure_logging(log_level=settings.log_level, logs_dir=LOGS_DIR)

    engine = create_sqlite_engine(settings.resolved_database_url)
    repo = MarketDataRepository(engine)
    strategy_engine = StrategyEngine()
    watchlist = load_watchlist()

    print("\n=== Segnali ETF ===")
    for item in watchlist.get("etf", []):
        symbol = item["symbol"]
        bars = _bars_to_dataframe(repo.get_bars(symbol, AssetClass.ETF, Timeframe.DAY_1))
        if bars.empty:
            print(f"[{symbol}] nessun dato storicizzato: esegui prima fetch_sample_data.py")
            continue
        for signal in strategy_engine.generate_signals(symbol, AssetClass.ETF, bars):
            print(f"[{symbol}] {signal.action.value.upper()} (confidenza {signal.confidence:.2f}) — {signal.reason}")

    print("\n=== Segnali azioni ===")
    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)
    for item in watchlist.get("equity", []):
        symbol = item["symbol"]
        bars = _bars_to_dataframe(repo.get_bars(symbol, AssetClass.EQUITY, Timeframe.DAY_1))
        if bars.empty:
            print(f"[{symbol}] nessun dato storicizzato: esegui prima fetch_sample_data.py")
            continue

        fundamentals = None
        try:
            fundamentals = equity_source.get_fundamentals(symbol)
        except DataSourceError as exc:
            logger.warning("Fondamentali non disponibili per %s: %s", symbol, exc)

        for signal in strategy_engine.generate_signals(
            symbol, AssetClass.EQUITY, bars, fundamentals=fundamentals
        ):
            print(f"[{symbol}] {signal.action.value.upper()} (confidenza {signal.confidence:.2f}) — {signal.reason}")

    print("\n=== Segnali crypto ===")
    for item in watchlist.get("crypto", []):
        symbol = item["symbol"]
        bars = _bars_to_dataframe(repo.get_bars(symbol, AssetClass.CRYPTO, Timeframe.DAY_1))
        if bars.empty:
            print(f"[{symbol}] nessun dato storicizzato: esegui prima fetch_sample_data.py")
            continue
        for signal in strategy_engine.generate_signals(symbol, AssetClass.CRYPTO, bars):
            print(f"[{symbol}] {signal.action.value.upper()} (confidenza {signal.confidence:.2f}) — {signal.reason}")


if __name__ == "__main__":
    main()
