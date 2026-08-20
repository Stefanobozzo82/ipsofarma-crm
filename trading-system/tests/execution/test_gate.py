"""Test di LiveTradingGate (percorso 'conferma esplicita' O 'periodo di validazione')."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from tests.execution.conftest import build_execution_config, make_eligibility, make_repository
from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide, OrderStatus
from trading_system.common.models import Order
from trading_system.execution.gate import LiveTradingGate


def _gate(**overrides) -> LiveTradingGate:
    config = build_execution_config(**overrides)
    return LiveTradingGate(config.live_gate, make_repository())


def _gate_with_repo(repo, **overrides) -> LiveTradingGate:
    config = build_execution_config(**overrides)
    return LiveTradingGate(config.live_gate, repo)


def _seed_paper_trades(repo, symbol, strategy_name, count, days_ago):
    old = datetime.now(timezone.utc) - timedelta(days=days_ago)
    for _ in range(count):
        repo.record_order(
            Order(
                symbol=symbol, asset_class=AssetClass.ETF, side=OrderSide.BUY, quantity=1.0,
                mode=ExecutionMode.PAPER, broker="paper", strategy_name=strategy_name,
                status=OrderStatus.FILLED, reason="seed", filled_price=100.0, filled_at=old, created_at=old,
            )
        )


def test_ineligible_backtest_always_rejects():
    gate = _gate()
    eligibility = make_eligibility(approved=False)

    decision = gate.check("SPY", "s1", eligibility, explicit_confirmation=True, live_trading_enabled=True)

    assert decision.approved_for_live is False
    assert "non idoneo" in decision.reason


def test_stale_backtest_rejects_even_with_confirmation():
    gate = _gate(live_gate={"max_backtest_age_days": 30})
    old_eligibility = make_eligibility(evaluated_at=datetime.now(timezone.utc) - timedelta(days=60))

    decision = gate.check("SPY", "s1", old_eligibility, explicit_confirmation=True, live_trading_enabled=True)

    assert decision.approved_for_live is False
    assert "scaduto" in decision.reason


def test_explicit_confirmation_path_approves():
    gate = _gate()
    eligibility = make_eligibility()

    decision = gate.check("SPY", "s1", eligibility, explicit_confirmation=True, live_trading_enabled=True)

    assert decision.approved_for_live is True
    assert "conferma esplicita" in decision.reason


def test_explicit_confirmation_alone_is_not_enough_without_env_flag():
    gate = _gate()
    eligibility = make_eligibility()

    decision = gate.check("SPY", "s1", eligibility, explicit_confirmation=True, live_trading_enabled=False)

    assert decision.approved_for_live is False


def test_env_flag_alone_is_not_enough_without_explicit_confirmation():
    gate = _gate()
    eligibility = make_eligibility()

    decision = gate.check("SPY", "s1", eligibility, explicit_confirmation=False, live_trading_enabled=True)

    assert decision.approved_for_live is False


def test_paper_validation_period_path_approves():
    repo = make_repository()
    gate = _gate_with_repo(repo, live_gate={"min_paper_trades": 5, "min_paper_trading_days": 14})
    _seed_paper_trades(repo, "SPY", "s1", count=5, days_ago=20)
    eligibility = make_eligibility()

    decision = gate.check("SPY", "s1", eligibility, explicit_confirmation=False, live_trading_enabled=False)

    assert decision.approved_for_live is True
    assert "validazione" in decision.reason


def test_paper_validation_period_needs_both_trades_and_days():
    repo = make_repository()
    gate = _gate_with_repo(repo, live_gate={"min_paper_trades": 5, "min_paper_trading_days": 14})
    _seed_paper_trades(repo, "SPY", "s1", count=5, days_ago=2)  # abbastanza trade, non abbastanza giorni
    eligibility = make_eligibility()

    decision = gate.check("SPY", "s1", eligibility, explicit_confirmation=False, live_trading_enabled=False)

    assert decision.approved_for_live is False


def test_paper_validation_stats_are_isolated_per_symbol_and_strategy():
    repo = make_repository()
    gate = _gate_with_repo(repo, live_gate={"min_paper_trades": 5, "min_paper_trading_days": 14})
    _seed_paper_trades(repo, "AAPL", "s1", count=10, days_ago=30)  # altro simbolo, non deve contare
    eligibility = make_eligibility(symbol="SPY")

    decision = gate.check("SPY", "s1", eligibility, explicit_confirmation=False, live_trading_enabled=False)

    assert decision.approved_for_live is False


def test_neither_path_rejects_with_both_statuses_in_reason():
    gate = _gate()
    eligibility = make_eligibility()

    decision = gate.check("SPY", "s1", eligibility, explicit_confirmation=False, live_trading_enabled=False)

    assert decision.approved_for_live is False
    assert "conferma esplicita" in decision.reason
    assert "validazione paper" in decision.reason
