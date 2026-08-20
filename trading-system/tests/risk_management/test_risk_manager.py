"""Test dell'orchestratore RiskManager (modulo critico: da Signal a RiskDecision)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from tests.risk_management.conftest import build_config
from tests.strategy_engine.conftest import make_bars, monotonic_decline, monotonic_rise, zigzag_high_volatility
from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.models import Signal
from trading_system.risk_management.risk_manager import RiskManager


def _signal(asset_class: AssetClass, action: SignalAction, confidence: float = 0.8) -> Signal:
    return Signal(
        symbol="TEST",
        asset_class=asset_class,
        action=action,
        confidence=confidence,
        reason="segnale di test",
        generated_at=datetime.now(timezone.utc),
        strategy_name="test_strategy",
    )


def _manager(**config_overrides) -> RiskManager:
    return RiskManager(config=build_config(**config_overrides))


def test_hold_signal_is_never_approved():
    manager = _manager()
    signal = _signal(AssetClass.EQUITY, SignalAction.HOLD)
    bars = make_bars(monotonic_rise(periods=30, pct=0.001))

    decision = manager.evaluate_signal(signal, bars, account_equity=100_000.0)

    assert decision.approved is False
    assert decision.action == SignalAction.HOLD
    assert "HOLD" in decision.reason


def test_disabled_asset_class_is_never_approved():
    manager = _manager(equity={"enabled": False})
    signal = _signal(AssetClass.EQUITY, SignalAction.BUY)
    bars = make_bars(monotonic_rise(periods=30, pct=0.001))

    decision = manager.evaluate_signal(signal, bars, account_equity=100_000.0)

    assert decision.approved is False
    assert "disabilitato" in decision.reason


def test_high_volatility_rejects_regardless_of_signal():
    manager = _manager()
    signal = _signal(AssetClass.CRYPTO, SignalAction.BUY, confidence=1.0)
    bars = make_bars(zigzag_high_volatility(periods=30), asset_class="crypto")

    decision = manager.evaluate_signal(signal, bars, account_equity=100_000.0)

    assert decision.approved is False
    assert "volatilità" in decision.reason.lower()


def test_approved_buy_produces_positive_quantity_and_stop_below_entry():
    manager = _manager()
    signal = _signal(AssetClass.ETF, SignalAction.BUY, confidence=0.8)
    bars = make_bars(monotonic_rise(periods=30, pct=0.001))
    entry_price = bars["close"].iloc[-1]

    decision = manager.evaluate_signal(signal, bars, account_equity=100_000.0)

    assert decision.approved is True
    assert decision.action == SignalAction.BUY
    assert decision.quantity > 0.0
    assert decision.entry_price == pytest.approx(entry_price)
    assert decision.stop_loss_price < decision.entry_price
    assert "Approvato" in decision.reason


def test_approved_sell_has_stop_above_entry():
    manager = _manager()
    signal = _signal(AssetClass.ETF, SignalAction.SELL, confidence=0.8)
    bars = make_bars(monotonic_decline(periods=30, pct=0.001))

    decision = manager.evaluate_signal(signal, bars, account_equity=100_000.0)

    assert decision.approved is True
    assert decision.stop_loss_price > decision.entry_price


def test_exposure_at_cap_rejects_new_position():
    manager = _manager()
    signal = _signal(AssetClass.CRYPTO, SignalAction.BUY, confidence=1.0)
    bars = make_bars(monotonic_rise(periods=30, pct=0.001), asset_class="crypto")

    decision = manager.evaluate_signal(
        signal, bars, account_equity=100_000.0,
        current_asset_class_exposure_pct=15.0,  # == crypto.max_portfolio_pct nella fixture
    )

    assert decision.approved is False
    assert "sizing" in decision.reason.lower()


def test_crypto_gets_tighter_stop_loss_than_equity_on_same_price_path():
    # A parità di segnale e prezzo, lo stop-loss crypto deve essere più
    # vicino al prezzo di entrata (stop_loss_pct più stringente da config).
    manager = _manager()
    bars = make_bars(monotonic_rise(periods=30, pct=0.001))
    entry_price = bars["close"].iloc[-1]

    crypto_decision = manager.evaluate_signal(
        _signal(AssetClass.CRYPTO, SignalAction.BUY), make_bars(monotonic_rise(periods=30, pct=0.001), "crypto"),
        account_equity=100_000.0,
    )
    equity_decision = manager.evaluate_signal(
        _signal(AssetClass.EQUITY, SignalAction.BUY), bars, account_equity=100_000.0,
    )

    crypto_stop_distance = entry_price - crypto_decision.stop_loss_price
    equity_stop_distance = entry_price - equity_decision.stop_loss_price
    assert crypto_stop_distance < equity_stop_distance


def test_missing_config_uses_the_compiled_shipped_config_not_a_silent_default():
    # Il RiskManager non deve mai partire con una configurazione implicita:
    # senza una config esplicita, deve caricare (e validare) il file
    # distribuito nel repo — ora compilato dal proprietario del progetto —
    # non inventare/derivare dei limiti impliciti.
    manager = RiskManager()

    assert manager._config.enabled is True
    assert manager._config.crypto.max_portfolio_pct <= manager._config.equity.max_portfolio_pct


def test_decision_always_carries_signal_confidence_for_traceability():
    manager = _manager()
    signal = _signal(AssetClass.ETF, SignalAction.BUY, confidence=0.42)
    bars = make_bars(monotonic_rise(periods=30, pct=0.001))

    decision = manager.evaluate_signal(signal, bars, account_equity=100_000.0)

    assert decision.signal_confidence == pytest.approx(0.42)
    assert decision.strategy_name == "test_strategy"
