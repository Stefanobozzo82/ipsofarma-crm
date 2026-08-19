#!/usr/bin/env python3
"""Demo end-to-end del modulo di data ingestion.

Scarica alcune barre storiche daily reali per gli strumenti definiti in
`config/assets.yaml` (un'azione/ETF via yfinance, una coppia crypto via
ccxt/Binance), le normalizza e le salva nel database locale.

Effettua chiamate di rete reali: usalo per una verifica manuale, non fa
parte della suite di test automatica (`pytest`), che mocka le fonti dati.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import yaml

from config.settings import ASSETS_PATH, LOGS_DIR, get_settings
from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.logging_config import configure_logging, get_logger
from trading_system.common.models import MarketBar
from trading_system.data_ingestion import (
    CryptoCCXTSource,
    EquityYFinanceSource,
    MarketDataRepository,
)
from trading_system.data_ingestion.storage import create_sqlite_engine

logger = get_logger(__name__)


def load_watchlist() -> dict:
    with open(ASSETS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def fetch_and_store(repo: MarketDataRepository) -> None:
    watchlist = load_watchlist()
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=30)

    all_bars: list[MarketBar] = []

    # --- Azioni/ETF via yfinance ---
    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)
    for item in watchlist.get("equity", []):
        symbol = item["symbol"]
        logger.info("Scarico dati equity per %s", symbol)
        bars = equity_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1)
        logger.info("Ricevute %d barre per %s (equity)", len(bars), symbol)
        all_bars.extend(bars)

    etf_source = EquityYFinanceSource(asset_class=AssetClass.ETF)
    for item in watchlist.get("etf", []):
        symbol = item["symbol"]
        logger.info("Scarico dati ETF per %s", symbol)
        bars = etf_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1)
        logger.info("Ricevute %d barre per %s (etf)", len(bars), symbol)
        all_bars.extend(bars)

    # --- Crypto via ccxt ---
    by_exchange: dict[str, list[str]] = {}
    for item in watchlist.get("crypto", []):
        by_exchange.setdefault(item.get("exchange", "binance"), []).append(item["symbol"])

    for exchange_id, symbols in by_exchange.items():
        crypto_source = CryptoCCXTSource(exchange_id=exchange_id)
        for symbol in symbols:
            logger.info("Scarico dati crypto per %s su %s", symbol, exchange_id)
            bars = crypto_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1)
            logger.info("Ricevute %d barre per %s (crypto)", len(bars), symbol)
            all_bars.extend(bars)

    inserted = repo.upsert_bars(all_bars)
    logger.info(
        "Completato | barre_totali_scaricate=%d nuove_righe_salvate=%d",
        len(all_bars), inserted,
    )


def main() -> None:
    settings = get_settings()
    configure_logging(log_level=settings.log_level, logs_dir=LOGS_DIR)

    engine = create_sqlite_engine(settings.resolved_database_url)
    repo = MarketDataRepository(engine)

    fetch_and_store(repo)


if __name__ == "__main__":
    main()
