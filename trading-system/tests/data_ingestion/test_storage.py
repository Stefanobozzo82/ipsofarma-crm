"""Test della persistenza (SQLite in-memory, nessun file su disco)."""

from __future__ import annotations

from datetime import datetime, timezone

from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.models import MarketBar
from trading_system.data_ingestion.storage import MarketDataRepository, create_sqlite_engine


def _bar(timestamp: datetime, close: float = 100.0) -> MarketBar:
    return MarketBar(
        symbol="AAPL",
        asset_class=AssetClass.EQUITY,
        timeframe=Timeframe.DAY_1,
        timestamp=timestamp,
        open=close - 1,
        high=close + 1,
        low=close - 2,
        close=close,
        volume=1000.0,
        source="yfinance",
    )


def _repo() -> MarketDataRepository:
    engine = create_sqlite_engine("sqlite:///:memory:")
    return MarketDataRepository(engine)


def test_upsert_bars_inserts_new_rows():
    repo = _repo()
    bars = [
        _bar(datetime(2024, 1, 1, tzinfo=timezone.utc), 100.0),
        _bar(datetime(2024, 1, 2, tzinfo=timezone.utc), 101.0),
    ]

    inserted = repo.upsert_bars(bars)

    assert inserted == 2
    stored = repo.get_bars("AAPL", AssetClass.EQUITY, Timeframe.DAY_1)
    assert len(stored) == 2
    assert stored[0].close == 100.0
    assert stored[1].close == 101.0


def test_upsert_bars_is_idempotent():
    repo = _repo()
    bar = _bar(datetime(2024, 1, 1, tzinfo=timezone.utc), 100.0)

    first_pass = repo.upsert_bars([bar])
    second_pass = repo.upsert_bars([bar])

    assert first_pass == 1
    assert second_pass == 0
    stored = repo.get_bars("AAPL", AssetClass.EQUITY, Timeframe.DAY_1)
    assert len(stored) == 1


def test_get_bars_returns_ordered_by_timestamp():
    repo = _repo()
    bars = [
        _bar(datetime(2024, 1, 3, tzinfo=timezone.utc), 103.0),
        _bar(datetime(2024, 1, 1, tzinfo=timezone.utc), 101.0),
        _bar(datetime(2024, 1, 2, tzinfo=timezone.utc), 102.0),
    ]
    repo.upsert_bars(bars)

    stored = repo.get_bars("AAPL", AssetClass.EQUITY, Timeframe.DAY_1)

    assert [b.close for b in stored] == [101.0, 102.0, 103.0]
