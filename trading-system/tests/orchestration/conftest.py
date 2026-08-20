"""Fixture/helper condivisi per i test del modulo 8 (orchestrazione).

Nessuna chiamata di rete reale nei test: le fonti dati (yfinance/ccxt) sono
sostituite da fake che restituiscono liste vuote — i dati usati dai test
vengono seminati direttamente nel `MarketDataRepository` in memoria, così
come già fanno gli altri moduli critici (risk management, execution,
portfolio) nei loro test.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.common.models import MarketBar
from trading_system.data_ingestion.storage import create_sqlite_engine
from trading_system.data_ingestion import MarketDataRepository


def make_data_repo() -> MarketDataRepository:
    return MarketDataRepository(create_sqlite_engine("sqlite:///:memory:"))


def seed_daily_bars(
    data_repo: MarketDataRepository,
    symbol: str,
    asset_class: AssetClass,
    prices: list[float],
    source: str = "test",
) -> None:
    """Semina barre daily con timestamp crescenti, una al giorno, che finiscono oggi."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=len(prices) - 1)
    bars = [
        MarketBar(
            symbol=symbol, asset_class=asset_class, timeframe=Timeframe.DAY_1,
            timestamp=start + timedelta(days=i),
            open=price, high=price, low=price, close=price, volume=1_000.0, source=source,
        )
        for i, price in enumerate(prices)
    ]
    data_repo.upsert_bars(bars)


class FakeDataSource:
    """Sostituisce `EquityYFinanceSource`/`CryptoCCXTSource` nei test: nessuna rete.

    `get_historical_bars` ritorna sempre una lista vuota (i dati per i test
    sono già seminati direttamente nel repository con `seed_daily_bars`);
    `get_fundamentals` solleva `DataSourceError` di default, come farebbe la
    fonte reale quando i fondamentali non sono disponibili.
    """

    #: Simboli per cui `get_historical_bars` deve sollevare `DataSourceError`
    #: (per testare la resilienza del ciclo a una fonte dati che fallisce).
    failing_symbols: set[str] = set()

    def __init__(self, *args, **kwargs) -> None:
        pass

    def get_historical_bars(self, symbol: str, start, end, timeframe: Timeframe) -> list[MarketBar]:
        if symbol in self.failing_symbols:
            raise DataSourceError(f"fonte dati non disponibile per {symbol} (test)")
        return []

    def get_fundamentals(self, symbol: str) -> dict:
        raise DataSourceError("fondamentali non disponibili (test)")
