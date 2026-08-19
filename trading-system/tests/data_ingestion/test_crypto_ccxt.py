"""Test del connettore crypto (ccxt), con chiamate di rete mockate."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.data_ingestion.crypto_ccxt import CryptoCCXTSource


class _FakeExchange:
    def __init__(self, ohlcv_rows=None, ticker=None, raise_error=False):
        self._ohlcv_rows = ohlcv_rows or []
        self._ticker = ticker or {}
        self._raise_error = raise_error
        self.fetch_ohlcv_calls = []

    def fetch_ohlcv(self, symbol, timeframe=None, since=None, limit=None):
        if self._raise_error:
            raise RuntimeError("errore di rete simulato")
        self.fetch_ohlcv_calls.append(since)
        if self.fetch_ohlcv_calls.count(since) > 1:
            # protezione anti-loop-infinito nel test
            return []
        return self._ohlcv_rows

    def fetch_ticker(self, symbol):
        if self._raise_error:
            raise RuntimeError("errore di rete simulato")
        return self._ticker


def _sample_rows():
    base_ms = int(datetime(2024, 1, 1, tzinfo=timezone.utc).timestamp() * 1000)
    day_ms = 24 * 60 * 60 * 1000
    return [
        [base_ms, 40000.0, 41000.0, 39500.0, 40500.0, 12.5],
        [base_ms + day_ms, 40500.0, 42000.0, 40000.0, 41800.0, 15.2],
    ]


def test_get_historical_bars_normalizes_to_common_schema():
    fake_exchange = _FakeExchange(ohlcv_rows=_sample_rows())
    source = CryptoCCXTSource(
        exchange_id="binance",
        exchange_factory=lambda exchange_id: fake_exchange,
    )

    bars = source.get_historical_bars(
        "BTC/USDT",
        datetime(2024, 1, 1, tzinfo=timezone.utc),
        datetime(2024, 1, 3, tzinfo=timezone.utc),
        Timeframe.DAY_1,
    )

    assert len(bars) == 2
    first = bars[0]
    assert first.symbol == "BTC/USDT"
    assert first.asset_class == AssetClass.CRYPTO
    assert first.source == "ccxt.binance"
    assert first.open == 40000.0
    assert first.timestamp.tzinfo is not None
    # ordinate per timestamp crescente
    assert bars[0].timestamp < bars[1].timestamp


def test_get_historical_bars_empty_result_returns_empty_list():
    fake_exchange = _FakeExchange(ohlcv_rows=[])
    source = CryptoCCXTSource(exchange_factory=lambda exchange_id: fake_exchange)

    bars = source.get_historical_bars(
        "BTC/USDT",
        datetime(2024, 1, 1, tzinfo=timezone.utc),
        datetime(2024, 1, 3, tzinfo=timezone.utc),
    )

    assert bars == []


def test_get_historical_bars_raises_data_source_error_on_failure():
    fake_exchange = _FakeExchange(raise_error=True)
    source = CryptoCCXTSource(exchange_factory=lambda exchange_id: fake_exchange)

    with pytest.raises(DataSourceError):
        source.get_historical_bars(
            "BTC/USDT",
            datetime(2024, 1, 1, tzinfo=timezone.utc),
            datetime(2024, 1, 3, tzinfo=timezone.utc),
        )


def test_get_latest_price_returns_last_from_ticker():
    fake_exchange = _FakeExchange(ticker={"last": 42123.45})
    source = CryptoCCXTSource(exchange_factory=lambda exchange_id: fake_exchange)

    price = source.get_latest_price("BTC/USDT")

    assert price == 42123.45


def test_get_latest_price_raises_when_no_last_price():
    fake_exchange = _FakeExchange(ticker={})
    source = CryptoCCXTSource(exchange_factory=lambda exchange_id: fake_exchange)

    with pytest.raises(DataSourceError):
        source.get_latest_price("BTC/USDT")
