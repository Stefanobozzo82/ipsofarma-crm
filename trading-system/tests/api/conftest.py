"""Fixture/helper condivisi per i test del modulo 7 (dashboard)."""

from __future__ import annotations

from datetime import datetime, timezone

from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide, OrderStatus, Timeframe
from trading_system.common.models import MarketBar, Order
from trading_system.data_ingestion.storage import MarketDataRepository
from trading_system.data_ingestion.storage import create_sqlite_engine as create_data_engine
from trading_system.execution.storage import ExecutionRepository
from trading_system.execution.storage import create_sqlite_engine as create_execution_engine
from trading_system.portfolio.config_loader import AllocationProfile, PortfolioConfig
from trading_system.risk_management.config_loader import AssetClassRiskLimits, PortfolioRiskLimits, RiskLimitsConfig


def make_market_data_repo() -> MarketDataRepository:
    return MarketDataRepository(create_data_engine("sqlite:///:memory:"))


def make_execution_repo() -> ExecutionRepository:
    return ExecutionRepository(create_execution_engine("sqlite:///:memory:"))


def seed_price(repo: MarketDataRepository, symbol: str, asset_class: AssetClass, close: float) -> None:
    repo.upsert_bars(
        [
            MarketBar(
                symbol=symbol, asset_class=asset_class, timeframe=Timeframe.DAY_1,
                timestamp=datetime.now(timezone.utc), open=close, high=close, low=close, close=close,
                volume=1000.0, source="test",
            )
        ]
    )


def seed_order(
    repo: ExecutionRepository,
    symbol: str = "SPY",
    asset_class: AssetClass = AssetClass.ETF,
    side: OrderSide = OrderSide.BUY,
    status: OrderStatus = OrderStatus.FILLED,
    mode: ExecutionMode = ExecutionMode.PAPER,
    strategy_name: str = "s1",
    reason: str = "test",
    created_at: datetime | None = None,
) -> None:
    now = created_at or datetime.now(timezone.utc)
    repo.record_order(
        Order(
            symbol=symbol, asset_class=asset_class, side=side, quantity=1.0, mode=mode, broker="paper",
            strategy_name=strategy_name, status=status, reason=reason,
            filled_price=100.0 if status == OrderStatus.FILLED else None,
            filled_at=now if status == OrderStatus.FILLED else None, created_at=now,
        )
    )


def build_risk_limits(**overrides) -> RiskLimitsConfig:
    data = {
        "version": 1,
        "enabled": True,
        "equity": {"enabled": True, "max_portfolio_pct": 60.0, "max_position_pct": 10.0, "stop_loss_pct": 8.0, "max_volatility_annualized": 0.40},
        "etf": {"enabled": True, "max_portfolio_pct": 70.0, "max_position_pct": 15.0, "stop_loss_pct": 6.0, "max_volatility_annualized": 0.30},
        "crypto": {"enabled": True, "max_portfolio_pct": 15.0, "max_position_pct": 5.0, "stop_loss_pct": 5.0, "max_volatility_annualized": 0.25},
        "portfolio": {"max_drawdown_pct": 20.0, "max_daily_loss_pct": 5.0},
    }
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key].update(value)
        else:
            data[key] = value
    return RiskLimitsConfig(
        version=data["version"], enabled=data["enabled"],
        equity=AssetClassRiskLimits(**data["equity"]), etf=AssetClassRiskLimits(**data["etf"]),
        crypto=AssetClassRiskLimits(**data["crypto"]), portfolio=PortfolioRiskLimits(**data["portfolio"]),
    )


def build_portfolio_config(**overrides) -> PortfolioConfig:
    data = {
        "active_profile": "balanced",
        "rebalance_threshold_pct": 5.0,
        "profiles": {
            "balanced": {"equity": 30.0, "etf": 50.0, "crypto": 10.0},
        },
    }
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key].update(value)
        else:
            data[key] = value
    profiles = {name: AllocationProfile(**profile) for name, profile in data["profiles"].items()}
    return PortfolioConfig(
        active_profile=data["active_profile"], rebalance_threshold_pct=data["rebalance_threshold_pct"],
        profiles=profiles,
    )
