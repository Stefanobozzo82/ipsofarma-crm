"""Test degli indicatori tecnici condivisi."""

from __future__ import annotations

import numpy as np
import pandas as pd

from tests.strategy_engine.conftest import monotonic_decline, monotonic_rise
from trading_system.strategy_engine.indicators import annualized_volatility, rsi, sma


def test_sma_matches_manual_rolling_mean():
    close = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
    result = sma(close, window=3)

    assert result.iloc[:2].isna().all()
    assert result.iloc[2] == (1.0 + 2.0 + 3.0) / 3
    assert result.iloc[-1] == (4.0 + 5.0 + 6.0) / 3


def test_rsi_approaches_zero_on_pure_decline():
    close = pd.Series(monotonic_decline(periods=40, pct=0.01))
    result = rsi(close, period=14)

    assert result.iloc[:14].isna().all()
    assert result.iloc[-1] < 5.0  # solo perdite nel periodo => RSI vicino a 0


def test_rsi_approaches_hundred_on_pure_rise():
    close = pd.Series(monotonic_rise(periods=40, pct=0.01))
    result = rsi(close, period=14)

    assert result.iloc[-1] > 95.0  # solo guadagni nel periodo => RSI vicino a 100


def test_annualized_volatility_is_zero_for_constant_returns():
    close = pd.Series(monotonic_decline(periods=30, pct=0.01))
    result = annualized_volatility(close, window=10)

    assert result.iloc[:10].isna().all()
    assert np.isclose(result.iloc[-1], 0.0, atol=1e-8)


def test_annualized_volatility_is_positive_for_noisy_prices():
    close = pd.Series([100.0, 150.0, 100.0, 150.0, 100.0, 150.0, 100.0, 150.0, 100.0, 150.0, 100.0])
    result = annualized_volatility(close, window=5)

    assert result.iloc[-1] > 1.0  # oscillazioni ampie => volatilità annualizzata molto alta
