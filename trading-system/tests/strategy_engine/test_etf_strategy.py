"""Test della strategia ETF (media mobile)."""

from __future__ import annotations

import pytest

from tests.strategy_engine.conftest import downtrend, flat, make_bars, uptrend
from trading_system.common.enums import AssetClass, SignalAction
from trading_system.strategy_engine.etf_strategies import MovingAverageCrossoverStrategy


def _strategy() -> MovingAverageCrossoverStrategy:
    return MovingAverageCrossoverStrategy(short_window=5, long_window=20, confidence_scale_pct=5.0)


def test_uptrend_generates_buy_with_positive_confidence():
    bars = make_bars(uptrend(periods=40))
    signal = _strategy().generate_signal("SPY", bars)

    assert signal.action == SignalAction.BUY
    assert signal.asset_class == AssetClass.ETF
    assert 0.0 < signal.confidence <= 1.0
    assert "rialzista" in signal.reason


def test_downtrend_generates_sell():
    bars = make_bars(downtrend(periods=40))
    signal = _strategy().generate_signal("SPY", bars)

    assert signal.action == SignalAction.SELL
    assert signal.confidence > 0.0
    assert "ribassista" in signal.reason


def test_flat_price_generates_hold_with_zero_confidence():
    bars = make_bars(flat(periods=40))
    signal = _strategy().generate_signal("SPY", bars)

    assert signal.action == SignalAction.HOLD
    assert signal.confidence == 0.0


def test_insufficient_data_generates_hold():
    bars = make_bars(uptrend(periods=10))
    signal = _strategy().generate_signal("SPY", bars)

    assert signal.action == SignalAction.HOLD
    assert "insufficienti" in signal.reason


def test_missing_required_column_raises():
    bars = make_bars(uptrend(periods=40)).drop(columns=["close"])
    with pytest.raises(ValueError):
        _strategy().generate_signal("SPY", bars)


def test_invalid_windows_rejected():
    with pytest.raises(ValueError):
        MovingAverageCrossoverStrategy(short_window=50, long_window=20)


def test_strategy_name_is_traceable():
    strategy = _strategy()
    assert strategy.name == "etf_moving_average_5_20"
