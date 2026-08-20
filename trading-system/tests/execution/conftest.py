"""Fixture/helper condivisi per i test dell'execution layer."""

from __future__ import annotations

import copy
from datetime import datetime, timezone

from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.models import AllocationDecision, BacktestEligibility
from trading_system.execution.config_loader import ExecutionConfig
from trading_system.execution.storage import ExecutionRepository, create_sqlite_engine

VALID_EXECUTION_CONFIG_DICT = {
    "mode": "paper",
    "paper": {"initial_cash": 100_000.0, "commission_pct": 0.0},
    "live_brokers": {"equity": "alpaca", "etf": "alpaca", "crypto": "kraken"},
    "live_gate": {"max_backtest_age_days": 30, "min_paper_trading_days": 14, "min_paper_trades": 5},
}


def build_execution_config(**overrides) -> ExecutionConfig:
    data = copy.deepcopy(VALID_EXECUTION_CONFIG_DICT)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key].update(value)
        else:
            data[key] = value
    return ExecutionConfig(**data)


def make_repository() -> ExecutionRepository:
    engine = create_sqlite_engine("sqlite:///:memory:")
    return ExecutionRepository(engine)


def make_allocation_decision(
    symbol: str = "SPY",
    asset_class: AssetClass = AssetClass.ETF,
    action: SignalAction = SignalAction.BUY,
    approved: bool = True,
    quantity: float = 10.0,
    reason: str = "decisione di test",
    strategy_name: str = "test_strategy",
) -> AllocationDecision:
    return AllocationDecision(
        symbol=symbol, asset_class=asset_class, approved=approved, action=action,
        quantity=quantity if approved else 0.0, original_quantity=quantity,
        reason=reason, strategy_name=strategy_name, evaluated_at=datetime.now(timezone.utc),
    )


def make_eligibility(
    symbol: str = "SPY",
    asset_class: AssetClass = AssetClass.ETF,
    strategy_name: str = "test_strategy",
    approved: bool = True,
    evaluated_at: datetime | None = None,
) -> BacktestEligibility:
    return BacktestEligibility(
        symbol=symbol, asset_class=asset_class, strategy_name=strategy_name,
        approved=approved, reason="test", evaluated_at=evaluated_at or datetime.now(timezone.utc),
    )


def fixed_price_provider(price: float = 100.0):
    def _provider(symbol: str, asset_class: AssetClass) -> float:
        return price

    return _provider
