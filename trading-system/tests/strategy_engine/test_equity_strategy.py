"""Test della strategia azionaria (media mobile + filtro fondamentale)."""

from __future__ import annotations

from tests.strategy_engine.conftest import downtrend, make_bars, uptrend
from trading_system.common.enums import SignalAction
from trading_system.strategy_engine.equity_strategies import (
    EquityMovingAverageFundamentalsStrategy,
)

_STRONG_FUNDAMENTALS = {
    "pe_ratio": 15.0,
    "return_on_equity": 0.25,
    "debt_to_equity": 50.0,
    "revenue_growth": 0.10,
}

_WEAK_FUNDAMENTALS = {
    "pe_ratio": 80.0,
    "return_on_equity": 0.01,
    "debt_to_equity": 400.0,
    "revenue_growth": -0.05,
}


def _strategy() -> EquityMovingAverageFundamentalsStrategy:
    return EquityMovingAverageFundamentalsStrategy(short_window=5, long_window=20, confidence_scale_pct=5.0)


def test_uptrend_without_fundamentals_is_technical_only():
    bars = make_bars(uptrend(periods=40))
    signal = _strategy().generate_signal("AAPL", bars)

    assert signal.action == SignalAction.BUY
    assert "solo tecnico" in signal.reason


def test_uptrend_with_strong_fundamentals_blends_confidence_up():
    bars = make_bars(uptrend(periods=40))
    technical_only = _strategy().generate_signal("AAPL", bars)
    blended = _strategy().generate_signal("AAPL", bars, fundamentals=_STRONG_FUNDAMENTALS)

    assert blended.action == SignalAction.BUY
    assert blended.confidence >= technical_only.confidence
    assert "score 1.00" in blended.reason


def test_uptrend_with_weak_fundamentals_vetoes_buy():
    bars = make_bars(uptrend(periods=40))
    signal = _strategy().generate_signal("AAPL", bars, fundamentals=_WEAK_FUNDAMENTALS)

    assert signal.action == SignalAction.HOLD
    assert signal.confidence == 0.0
    assert "VETATO" in signal.reason


def test_downtrend_with_weak_fundamentals_is_not_vetoed():
    # Il veto si applica solo ai segnali BUY: un SELL con fondamentali
    # deboli resta un SELL (i fondamentali deboli non "salvano" il titolo).
    bars = make_bars(downtrend(periods=40))
    signal = _strategy().generate_signal("AAPL", bars, fundamentals=_WEAK_FUNDAMENTALS)

    assert signal.action == SignalAction.SELL
    assert "VETATO" not in signal.reason


def test_partial_fundamentals_scores_only_available_fields():
    bars = make_bars(uptrend(periods=40))
    partial = {"pe_ratio": 15.0, "return_on_equity": None, "debt_to_equity": None, "revenue_growth": None}
    signal = _strategy().generate_signal("AAPL", bars, fundamentals=partial)

    assert signal.action == SignalAction.BUY
    assert "score 1.00" in signal.reason  # unico criterio disponibile, superato


def test_fundamentals_all_none_falls_back_to_technical_only():
    bars = make_bars(uptrend(periods=40))
    empty = {"pe_ratio": None, "return_on_equity": None, "debt_to_equity": None, "revenue_growth": None}
    signal = _strategy().generate_signal("AAPL", bars, fundamentals=empty)

    assert signal.action == SignalAction.BUY
    assert "Nessun dato fondamentale valido" in signal.reason
