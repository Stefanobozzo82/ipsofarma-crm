"""Test delle metriche di performance (funzioni pure)."""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import pytest

from trading_system.backtesting import metrics
from trading_system.common.enums import AssetClass, OrderSide
from trading_system.common.models import BacktestTrade


def _equity(values: list[float], start: str = "2024-01-01", freq: str = "D") -> pd.Series:
    index = pd.date_range(start, periods=len(values), freq=freq, tz="UTC")
    return pd.Series(values, index=index, name="equity")


def _trade(pnl: float) -> BacktestTrade:
    return BacktestTrade(
        symbol="TEST", asset_class=AssetClass.ETF, side=OrderSide.BUY,
        entry_at=datetime.now(timezone.utc), entry_price=100.0,
        exit_at=datetime.now(timezone.utc), exit_price=100.0 + pnl,
        quantity=1.0, pnl=pnl, pnl_pct=pnl, exit_reason="segnale_sell",
    )


class TestTotalReturn:
    def test_basic_gain(self):
        assert metrics.total_return_pct(_equity([100.0, 110.0, 121.0])) == pytest.approx(21.0)

    def test_too_short_returns_zero(self):
        assert metrics.total_return_pct(_equity([100.0])) == 0.0

    def test_zero_starting_value_returns_zero(self):
        assert metrics.total_return_pct(_equity([0.0, 50.0])) == 0.0


class TestCagr:
    def test_one_year_doubling_is_100_pct(self):
        equity = _equity([100.0, 200.0], start="2024-01-01", freq="365D")
        assert metrics.cagr_pct(equity) == pytest.approx(100.0, abs=1.0)

    def test_short_duration_falls_back_to_total_return(self):
        index = pd.DatetimeIndex(
            [pd.Timestamp("2024-01-01", tz="UTC"), pd.Timestamp("2024-01-01T01:00:00", tz="UTC")]
        )
        equity = pd.Series([100.0, 105.0], index=index)
        assert metrics.cagr_pct(equity) == pytest.approx(5.0)

    def test_total_loss_returns_minus_100(self):
        equity = _equity([100.0, 0.0], start="2024-01-01", freq="365D")
        assert metrics.cagr_pct(equity) == -100.0


class TestMaxDrawdown:
    def test_known_drawdown(self):
        # picco 120, minimo successivo 90 => drawdown (90-120)/120 = -25%
        equity = _equity([100.0, 120.0, 90.0, 110.0])
        assert metrics.max_drawdown_pct(equity) == pytest.approx(25.0)

    def test_monotonic_rise_has_zero_drawdown(self):
        equity = _equity([100.0, 110.0, 120.0])
        assert metrics.max_drawdown_pct(equity) == 0.0

    def test_empty_series_returns_zero(self):
        assert metrics.max_drawdown_pct(pd.Series(dtype=float)) == 0.0


class TestSharpeRatio:
    def test_zero_variance_returns_zero(self):
        equity = _equity([100.0, 100.0, 100.0])
        assert metrics.sharpe_ratio(equity) == 0.0

    def test_too_short_returns_zero(self):
        assert metrics.sharpe_ratio(_equity([100.0])) == 0.0

    def test_positive_trend_gives_positive_sharpe(self):
        equity = _equity([100.0, 102.0, 104.0, 106.0, 108.0])
        assert metrics.sharpe_ratio(equity) > 0.0


class TestWinRate:
    def test_mixed_trades(self):
        trades = [_trade(10.0), _trade(-5.0), _trade(3.0), _trade(-1.0)]
        assert metrics.win_rate_pct(trades) == pytest.approx(50.0)

    def test_no_trades_returns_zero(self):
        assert metrics.win_rate_pct([]) == 0.0

    def test_all_winners(self):
        assert metrics.win_rate_pct([_trade(1.0), _trade(2.0)]) == 100.0
