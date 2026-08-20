"""Test del filtro di volatilità/rischio per categoria."""

from __future__ import annotations

from tests.risk_management.conftest import build_config
from tests.strategy_engine.conftest import (
    make_bars,
    monotonic_decline,
    zigzag_high_volatility,
    zigzag_pct,
)
from trading_system.risk_management.volatility_filter import check_volatility


def test_low_volatility_passes():
    config = build_config()
    bars = make_bars(monotonic_decline(periods=30, pct=0.001))

    result = check_volatility(bars, config.equity, window=20)

    assert result.passed is True
    assert result.measured_volatility is not None
    assert result.measured_volatility <= config.equity.max_volatility_annualized


def test_high_volatility_fails():
    config = build_config()
    bars = make_bars(zigzag_high_volatility(periods=30))

    result = check_volatility(bars, config.crypto, window=20)

    assert result.passed is False
    assert "supera il limite" in result.reason
    assert result.measured_volatility > config.crypto.max_volatility_annualized


def test_insufficient_data_fails_safe():
    config = build_config()
    bars = make_bars(monotonic_decline(periods=5, pct=0.001))

    result = check_volatility(bars, config.equity, window=20)

    assert result.passed is False
    assert result.measured_volatility is None
    assert "insufficienti" in result.reason


def test_same_data_different_thresholds_per_asset_class():
    # Stessa serie storica (volatilità annualizzata ~39%): con le soglie di
    # default (crypto 25%, equity 40%), il limite più stringente su crypto
    # la boccia mentre lo stesso identico dato passa per equity.
    config = build_config()
    bars = make_bars(zigzag_pct(periods=30, base=100.0, pct=0.01))

    crypto_result = check_volatility(bars, config.crypto, window=20)
    equity_result = check_volatility(bars, config.equity, window=20)

    assert crypto_result.measured_volatility == equity_result.measured_volatility
    assert crypto_result.passed is False
    assert equity_result.passed is True
