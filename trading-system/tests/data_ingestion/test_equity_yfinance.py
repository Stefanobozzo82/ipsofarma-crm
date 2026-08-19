"""Test del connettore azioni/ETF (yfinance), con chiamate di rete mockate."""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import pytest

from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.data_ingestion.equity_yfinance import EquityYFinanceSource


class _FakeTicker:
    def __init__(self, history_df: pd.DataFrame | None, raise_error: bool = False):
        self._history_df = history_df
        self._raise_error = raise_error

    def history(self, **kwargs):
        if self._raise_error:
            raise RuntimeError("errore di rete simulato")
        return self._history_df


def _sample_history() -> pd.DataFrame:
    index = pd.date_range("2024-01-01", periods=3, freq="D", tz="America/New_York")
    return pd.DataFrame(
        {
            "Open": [100.0, 101.0, 102.0],
            "High": [105.0, 106.0, 107.0],
            "Low": [99.0, 100.0, 101.0],
            "Close": [104.0, 105.0, 106.0],
            "Volume": [1000, 1100, 1200],
        },
        index=index,
    )


def test_get_historical_bars_normalizes_to_common_schema():
    source = EquityYFinanceSource(
        asset_class=AssetClass.EQUITY,
        ticker_factory=lambda symbol: _FakeTicker(_sample_history()),
    )

    bars = source.get_historical_bars(
        "AAPL",
        datetime(2024, 1, 1, tzinfo=timezone.utc),
        datetime(2024, 1, 5, tzinfo=timezone.utc),
        Timeframe.DAY_1,
    )

    assert len(bars) == 3
    first = bars[0]
    assert first.symbol == "AAPL"
    assert first.asset_class == AssetClass.EQUITY
    assert first.timeframe == Timeframe.DAY_1
    assert first.source == "yfinance"
    assert first.open == 100.0
    assert first.close == 104.0
    assert first.timestamp.tzinfo is not None


def test_get_historical_bars_empty_result_returns_empty_list():
    source = EquityYFinanceSource(
        asset_class=AssetClass.ETF,
        ticker_factory=lambda symbol: _FakeTicker(pd.DataFrame()),
    )

    bars = source.get_historical_bars(
        "SPY",
        datetime(2024, 1, 1, tzinfo=timezone.utc),
        datetime(2024, 1, 5, tzinfo=timezone.utc),
    )

    assert bars == []


def test_get_historical_bars_raises_data_source_error_on_failure():
    source = EquityYFinanceSource(
        ticker_factory=lambda symbol: _FakeTicker(None, raise_error=True),
    )

    with pytest.raises(DataSourceError):
        source.get_historical_bars(
            "AAPL",
            datetime(2024, 1, 1, tzinfo=timezone.utc),
            datetime(2024, 1, 5, tzinfo=timezone.utc),
        )


def test_get_latest_price_returns_last_close():
    source = EquityYFinanceSource(
        ticker_factory=lambda symbol: _FakeTicker(_sample_history()),
    )

    price = source.get_latest_price("AAPL")

    assert price == 106.0


def test_invalid_asset_class_rejected():
    with pytest.raises(ValueError):
        EquityYFinanceSource(asset_class=AssetClass.CRYPTO)
