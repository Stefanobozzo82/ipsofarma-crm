"""Test della valutazione di eleggibilità di un BacktestResult."""

from __future__ import annotations

from datetime import datetime, timezone

from trading_system.backtesting.config_loader import EligibilityCriteria
from trading_system.backtesting.eligibility import evaluate_eligibility
from trading_system.common.enums import AssetClass
from trading_system.common.models import BacktestResult

_CRITERIA = EligibilityCriteria(min_trades=10, min_sharpe_ratio=0.5, max_drawdown_pct=25.0, min_win_rate_pct=40.0)


def _result(**overrides) -> BacktestResult:
    now = datetime.now(timezone.utc)
    data = dict(
        symbol="SPY", asset_class=AssetClass.ETF, strategy_name="etf_moving_average_20_50",
        start_at=now, end_at=now, initial_equity=100_000.0, final_equity=110_000.0,
        total_return_pct=10.0, cagr_pct=10.0, max_drawdown_pct=10.0, sharpe_ratio=1.0,
        win_rate_pct=55.0, num_trades=20, trades=[], generated_at=now,
    )
    data.update(overrides)
    return BacktestResult(**data)


def test_all_criteria_met_is_approved():
    decision = evaluate_eligibility(_result(), _CRITERIA)

    assert decision.approved is True
    assert "positivo" in decision.reason


def test_too_few_trades_rejects():
    decision = evaluate_eligibility(_result(num_trades=3), _CRITERIA)

    assert decision.approved is False
    assert "trade insufficiente" in decision.reason


def test_low_sharpe_rejects():
    decision = evaluate_eligibility(_result(sharpe_ratio=0.1), _CRITERIA)

    assert decision.approved is False
    assert "Sharpe" in decision.reason


def test_excessive_drawdown_rejects():
    decision = evaluate_eligibility(_result(max_drawdown_pct=40.0), _CRITERIA)

    assert decision.approved is False
    assert "drawdown" in decision.reason


def test_low_win_rate_rejects():
    decision = evaluate_eligibility(_result(win_rate_pct=20.0), _CRITERIA)

    assert decision.approved is False
    assert "win rate" in decision.reason


def test_multiple_failures_are_all_listed():
    decision = evaluate_eligibility(_result(num_trades=2, sharpe_ratio=-1.0), _CRITERIA)

    assert decision.approved is False
    assert "trade insufficiente" in decision.reason
    assert "Sharpe" in decision.reason


def test_decision_carries_symbol_and_strategy_for_traceability():
    decision = evaluate_eligibility(_result(symbol="AAPL", strategy_name="my_strategy"), _CRITERIA)

    assert decision.symbol == "AAPL"
    assert decision.strategy_name == "my_strategy"
