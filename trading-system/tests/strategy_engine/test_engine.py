"""Test dell'orchestratore StrategyEngine."""

from __future__ import annotations

import pytest

from tests.strategy_engine.conftest import downtrend, make_bars, uptrend
from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.exceptions import ConfigurationError
from trading_system.strategy_engine.engine import StrategyEngine

_FULL_CONFIG = {
    "etf": {"moving_average": {"enabled": True, "short_window": 5, "long_window": 20}},
    "equity": {
        "moving_average": {"enabled": True, "short_window": 5, "long_window": 20},
        "fundamentals": {"enabled": True, "veto_below_score": 0.5},
    },
    "crypto": {
        "rsi_volatility": {
            "enabled": True, "rsi_period": 14, "volatility_window": 20,
            "max_volatility_annualized": 0.80,
        }
    },
}


def test_builds_one_strategy_per_asset_class_from_config():
    engine = StrategyEngine(config=_FULL_CONFIG)

    assert len(engine.strategies_for(AssetClass.ETF)) == 1
    assert len(engine.strategies_for(AssetClass.EQUITY)) == 1
    assert len(engine.strategies_for(AssetClass.CRYPTO)) == 1


def test_disabled_strategy_is_not_built():
    config = {
        "etf": {"moving_average": {"enabled": False}},
        "equity": {"moving_average": {"enabled": False}, "fundamentals": {"enabled": False}},
        "crypto": {"rsi_volatility": {"enabled": False}},
    }
    engine = StrategyEngine(config=config)

    assert engine.strategies_for(AssetClass.ETF) == []
    assert engine.strategies_for(AssetClass.EQUITY) == []
    assert engine.strategies_for(AssetClass.CRYPTO) == []


def test_generate_signals_returns_one_signal_per_enabled_strategy():
    engine = StrategyEngine(config=_FULL_CONFIG)
    bars = make_bars(uptrend(periods=40))

    signals = engine.generate_signals("SPY", AssetClass.ETF, bars)

    assert len(signals) == 1
    assert signals[0].action == SignalAction.BUY
    assert signals[0].symbol == "SPY"


def test_generate_signals_raises_when_no_strategy_enabled_for_class():
    config = {
        "etf": {"moving_average": {"enabled": False}},
        "equity": {"moving_average": {"enabled": False}},
        "crypto": {"rsi_volatility": {"enabled": False}},
    }
    engine = StrategyEngine(config=config)
    bars = make_bars(uptrend(periods=40))

    with pytest.raises(ConfigurationError):
        engine.generate_signals("SPY", AssetClass.ETF, bars)


def test_generate_signals_passes_context_through_to_strategy():
    engine = StrategyEngine(config=_FULL_CONFIG)
    bars = make_bars(uptrend(periods=40))
    weak_fundamentals = {
        "pe_ratio": 100.0, "return_on_equity": 0.0, "debt_to_equity": 500.0, "revenue_growth": -0.2,
    }

    signals = engine.generate_signals("AAPL", AssetClass.EQUITY, bars, fundamentals=weak_fundamentals)

    assert len(signals) == 1
    assert signals[0].action == SignalAction.HOLD
    assert "VETATO" in signals[0].reason


def test_generate_signals_survives_a_strategy_exception(monkeypatch):
    engine = StrategyEngine(config=_FULL_CONFIG)
    broken_strategy = engine.strategies_for(AssetClass.ETF)[0]

    def _boom(*args, **kwargs):
        raise RuntimeError("errore simulato nella strategia")

    monkeypatch.setattr(broken_strategy, "generate_signal", _boom)

    signals = engine.generate_signals("SPY", AssetClass.ETF, make_bars(uptrend(periods=40)))

    assert signals == []


def test_default_config_builds_from_real_yaml_file():
    engine = StrategyEngine()

    assert len(engine.strategies_for(AssetClass.ETF)) == 1
    assert len(engine.strategies_for(AssetClass.EQUITY)) == 1
    assert len(engine.strategies_for(AssetClass.CRYPTO)) == 1
