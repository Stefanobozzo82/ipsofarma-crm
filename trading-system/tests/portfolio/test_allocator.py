"""Test del PortfolioAllocator (modulo critico: arbitraggio di budget + ribilanciamento)."""

from __future__ import annotations

import pytest

from tests.portfolio.conftest import build_portfolio_config, make_risk_decision
from trading_system.common.enums import AssetClass, SignalAction
from trading_system.portfolio.allocator import PortfolioAllocator


def _allocator(**overrides) -> PortfolioAllocator:
    return PortfolioAllocator(build_portfolio_config(**overrides))


# --- target_weights / current_weights / available_budget -------------------

def test_target_weights_match_active_profile():
    allocator = _allocator()
    weights = allocator.target_weights()

    assert weights[AssetClass.EQUITY] == 30.0
    assert weights[AssetClass.ETF] == 50.0
    assert weights[AssetClass.CRYPTO] == 10.0


def test_current_weights_computed_from_positions_value():
    allocator = _allocator()
    positions = {AssetClass.EQUITY: 20_000.0, AssetClass.ETF: 10_000.0, AssetClass.CRYPTO: 5_000.0}

    weights = allocator.current_weights(positions, total_equity=100_000.0)

    assert weights[AssetClass.EQUITY] == pytest.approx(20.0)
    assert weights[AssetClass.ETF] == pytest.approx(10.0)
    assert weights[AssetClass.CRYPTO] == pytest.approx(5.0)


def test_current_weights_zero_equity_returns_all_zero():
    allocator = _allocator()
    weights = allocator.current_weights({AssetClass.EQUITY: 1000.0}, total_equity=0.0)

    assert all(w == 0.0 for w in weights.values())


def test_available_budget_is_target_minus_current():
    allocator = _allocator()
    # target crypto = 10% di 100000 = 10000; posizione attuale 3000 => budget residuo 7000
    budget = allocator.available_budget(AssetClass.CRYPTO, {AssetClass.CRYPTO: 3_000.0}, 100_000.0)

    assert budget == pytest.approx(7_000.0)


def test_available_budget_floors_at_zero_when_overexposed():
    allocator = _allocator()
    budget = allocator.available_budget(AssetClass.CRYPTO, {AssetClass.CRYPTO: 50_000.0}, 100_000.0)

    assert budget == 0.0


# --- allocate ----------------------------------------------------------------

def test_buy_within_budget_is_approved_unchanged():
    allocator = _allocator()
    decision = make_risk_decision("SPY", AssetClass.ETF, quantity=10.0, entry_price=100.0)  # valore 1000

    [result] = allocator.allocate([decision], positions_value={}, total_equity=100_000.0)

    assert result.approved is True
    assert result.quantity == pytest.approx(10.0)
    assert result.original_quantity == pytest.approx(10.0)


def test_sell_always_passes_through_regardless_of_budget():
    allocator = _allocator()
    # etf già al 100% (ben oltre il target 50%): una SELL deve comunque passare.
    decision = make_risk_decision("SPY", AssetClass.ETF, action=SignalAction.SELL, quantity=5.0, entry_price=100.0)

    [result] = allocator.allocate([decision], positions_value={AssetClass.ETF: 100_000.0}, total_equity=100_000.0)

    assert result.approved is True
    assert result.quantity == pytest.approx(5.0)
    assert "non consumano budget" in result.reason


def test_rejected_input_decision_passes_through_as_not_approved():
    allocator = _allocator()
    decision = make_risk_decision("AAPL", AssetClass.EQUITY, approved=False, action=SignalAction.HOLD)

    [result] = allocator.allocate([decision], positions_value={}, total_equity=100_000.0)

    assert result.approved is False
    assert result.quantity == 0.0
    assert result.action == SignalAction.HOLD
    assert "già rifiutato dal risk management" in result.reason


def test_higher_confidence_buy_is_prioritized_when_budget_is_scarce():
    allocator = _allocator()
    # target crypto = 10% di 100000 = 10000 di budget totale.
    low_confidence = make_risk_decision(
        "BTC/USDT", AssetClass.CRYPTO, quantity=100.0, entry_price=100.0, confidence=0.3,
    )  # valore 10000, da solo consumerebbe tutto il budget
    high_confidence = make_risk_decision(
        "ETH/USDT", AssetClass.CRYPTO, quantity=50.0, entry_price=100.0, confidence=0.9,
    )  # valore 5000

    results = allocator.allocate([low_confidence, high_confidence], positions_value={}, total_equity=100_000.0)
    by_symbol = {r.symbol: r for r in results}

    # ETH (confidenza più alta) va per intero: consuma 5000, restano 5000.
    assert by_symbol["ETH/USDT"].approved is True
    assert by_symbol["ETH/USDT"].quantity == pytest.approx(50.0)

    # BTC (confidenza più bassa) viene ridotto per rientrare nei 5000 residui.
    assert by_symbol["BTC/USDT"].approved is True
    assert by_symbol["BTC/USDT"].quantity == pytest.approx(50.0)  # 5000 residui / 100 prezzo
    assert by_symbol["BTC/USDT"].original_quantity == pytest.approx(100.0)
    assert "Ridotto da" in by_symbol["BTC/USDT"].reason


def test_third_decision_rejected_once_budget_fully_consumed():
    allocator = _allocator()
    first = make_risk_decision("A", AssetClass.CRYPTO, quantity=100.0, entry_price=100.0, confidence=0.9)  # 10000
    second = make_risk_decision("B", AssetClass.CRYPTO, quantity=10.0, entry_price=100.0, confidence=0.5)  # 1000

    results = allocator.allocate([first, second], positions_value={}, total_equity=100_000.0)
    by_symbol = {r.symbol: r for r in results}

    assert by_symbol["A"].approved is True
    assert by_symbol["A"].quantity == pytest.approx(100.0)
    assert by_symbol["B"].approved is False
    assert by_symbol["B"].quantity == 0.0
    assert "esaurito" in by_symbol["B"].reason


def test_missing_entry_price_on_approved_buy_is_rejected_defensively():
    allocator = _allocator()
    decision = make_risk_decision("AAPL", AssetClass.EQUITY, entry_price=None)

    [result] = allocator.allocate([decision], positions_value={}, total_equity=100_000.0)

    assert result.approved is False
    assert "entry_price" in result.reason


def test_allocate_handles_multiple_asset_classes_independently():
    allocator = _allocator()
    etf_decision = make_risk_decision("SPY", AssetClass.ETF, quantity=10.0, entry_price=100.0)
    crypto_decision = make_risk_decision("BTC/USDT", AssetClass.CRYPTO, quantity=1.0, entry_price=100.0)

    results = allocator.allocate([etf_decision, crypto_decision], positions_value={}, total_equity=100_000.0)

    assert all(r.approved for r in results)
    assert len(results) == 2


# --- check_rebalance -----------------------------------------------------------

def test_no_rebalance_when_within_threshold():
    allocator = _allocator()
    positions = {AssetClass.EQUITY: 30_000.0, AssetClass.ETF: 50_000.0, AssetClass.CRYPTO: 10_000.0}

    actions = allocator.check_rebalance(positions, total_equity=100_000.0)

    assert actions == []


def test_overweight_asset_class_triggers_sell_rebalance():
    allocator = _allocator()
    # crypto target 10%, attuale 20% => scostamento +10, oltre soglia 5.
    positions = {AssetClass.EQUITY: 30_000.0, AssetClass.ETF: 50_000.0, AssetClass.CRYPTO: 20_000.0}

    [action] = allocator.check_rebalance(positions, total_equity=100_000.0)

    assert action.asset_class == AssetClass.CRYPTO
    assert action.action == SignalAction.SELL
    assert action.drift_pct == pytest.approx(10.0)
    assert action.amount == pytest.approx(10_000.0)


def test_underweight_asset_class_triggers_buy_rebalance():
    allocator = _allocator()
    # etf target 50%, attuale 30% => scostamento -20, oltre soglia 5.
    positions = {AssetClass.EQUITY: 30_000.0, AssetClass.ETF: 30_000.0, AssetClass.CRYPTO: 10_000.0}

    actions = allocator.check_rebalance(positions, total_equity=100_000.0)
    etf_action = next(a for a in actions if a.asset_class == AssetClass.ETF)

    assert etf_action.action == SignalAction.BUY
    assert etf_action.drift_pct == pytest.approx(-20.0)


def test_drift_exactly_at_threshold_is_not_flagged():
    allocator = _allocator()
    # crypto target 10%, soglia 5.0: attuale 15% => scostamento esattamente 5, non oltre.
    # equity ed etf restano esattamente al target per isolare il caso limite su crypto.
    positions = {AssetClass.EQUITY: 30_000.0, AssetClass.ETF: 50_000.0, AssetClass.CRYPTO: 15_000.0}

    actions = allocator.check_rebalance(positions, total_equity=100_000.0)

    assert actions == []


def test_multiple_drifts_sorted_by_magnitude_descending():
    allocator = _allocator()
    # equity: attuale 30% vs target 30% => drift 0 (non segnalato)
    # etf: attuale 30% vs target 50% => drift -20 (il più ampio)
    # crypto: attuale 20% vs target 10% => drift +10
    positions = {AssetClass.EQUITY: 30_000.0, AssetClass.ETF: 30_000.0, AssetClass.CRYPTO: 20_000.0}

    actions = allocator.check_rebalance(positions, total_equity=100_000.0)

    assert [a.asset_class for a in actions] == [AssetClass.ETF, AssetClass.CRYPTO]


def test_zero_equity_produces_no_rebalance_actions():
    allocator = _allocator()
    actions = allocator.check_rebalance({AssetClass.CRYPTO: 1000.0}, total_equity=0.0)

    assert actions == []
