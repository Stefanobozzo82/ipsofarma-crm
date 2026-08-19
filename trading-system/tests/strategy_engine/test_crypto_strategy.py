"""Test della strategia crypto (RSI + filtro di volatilità)."""

from __future__ import annotations

import pytest

from tests.strategy_engine.conftest import (
    alternating,
    make_bars,
    monotonic_decline,
    monotonic_rise,
    zigzag_high_volatility,
)
from trading_system.common.enums import AssetClass, SignalAction
from trading_system.strategy_engine.crypto_strategies import RSIVolatilityStrategy


def _strategy(max_volatility_annualized: float = 0.80) -> RSIVolatilityStrategy:
    return RSIVolatilityStrategy(
        rsi_period=14,
        rsi_oversold=30.0,
        rsi_overbought=70.0,
        volatility_window=20,
        max_volatility_annualized=max_volatility_annualized,
    )


def test_oversold_low_volatility_generates_buy():
    bars = make_bars(monotonic_decline(periods=40, pct=0.01), asset_class="crypto")
    signal = _strategy().generate_signal("BTC/USDT", bars)

    assert signal.action == SignalAction.BUY
    assert signal.asset_class == AssetClass.CRYPTO
    assert signal.confidence > 0.9  # RSI vicinissimo a 0 => segnale quasi massimo
    assert "ipervenduto" in signal.reason


def test_overbought_low_volatility_generates_sell():
    bars = make_bars(monotonic_rise(periods=40, pct=0.01), asset_class="crypto")
    signal = _strategy().generate_signal("BTC/USDT", bars)

    assert signal.action == SignalAction.SELL
    assert signal.confidence > 0.9
    assert "ipercomprato" in signal.reason


def test_neutral_rsi_generates_hold():
    bars = make_bars(alternating(periods=40, amplitude=1.0), asset_class="crypto")
    signal = _strategy().generate_signal("BTC/USDT", bars)

    assert signal.action == SignalAction.HOLD
    assert signal.confidence == 0.0
    assert "zona neutra" in signal.reason


def test_high_volatility_forces_hold_even_if_oversold():
    # zigzag: alterna +/-, quindi tende a un RSI neutro ma soprattutto a
    # una volatilità annualizzata molto alta che deve forzare HOLD.
    bars = make_bars(zigzag_high_volatility(periods=40), asset_class="crypto")
    signal = _strategy(max_volatility_annualized=0.80).generate_signal("BTC/USDT", bars)

    assert signal.action == SignalAction.HOLD
    assert "Filtro di rischio attivato" in signal.reason
    assert "volatilità" in signal.reason


def test_insufficient_data_generates_hold():
    bars = make_bars(monotonic_decline(periods=10), asset_class="crypto")
    signal = _strategy().generate_signal("BTC/USDT", bars)

    assert signal.action == SignalAction.HOLD
    assert "insufficienti" in signal.reason


def test_invalid_thresholds_rejected():
    with pytest.raises(ValueError):
        RSIVolatilityStrategy(rsi_oversold=80.0, rsi_overbought=20.0)
