"""Fixture/helper condivisi per i test del portfolio allocator.

`VALID_PORTFOLIO_DICT` è coerente con
`tests.risk_management.conftest.VALID_CONFIG_DICT` (nessun peso target
supera i rispettivi `max_portfolio_pct`).
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone

from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.models import RiskDecision
from trading_system.portfolio.config_loader import PortfolioConfig

VALID_PORTFOLIO_DICT = {
    "active_profile": "balanced",
    "rebalance_threshold_pct": 5.0,
    "profiles": {
        "conservative": {"equity": 15.0, "etf": 65.0, "crypto": 5.0},
        "balanced": {"equity": 30.0, "etf": 50.0, "crypto": 10.0},
        "aggressive": {"equity": 40.0, "etf": 40.0, "crypto": 12.0},
    },
}


def build_portfolio_config(**overrides) -> PortfolioConfig:
    """Costruisce una `PortfolioConfig` valida (bypassando la validazione
    contro i tetti di rischio, già coperta separatamente in
    test_config_loader.py), applicando eventuali override."""
    data = copy.deepcopy(VALID_PORTFOLIO_DICT)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key].update(value)
        else:
            data[key] = value
    return PortfolioConfig(**data)


def make_risk_decision(
    symbol: str,
    asset_class: AssetClass,
    action: SignalAction = SignalAction.BUY,
    approved: bool = True,
    quantity: float = 10.0,
    entry_price: float | None = 100.0,
    confidence: float = 0.8,
    reason: str = "decisione di test",
) -> RiskDecision:
    return RiskDecision(
        symbol=symbol,
        asset_class=asset_class,
        approved=approved,
        action=action,
        quantity=quantity if approved else 0.0,
        entry_price=entry_price,
        stop_loss_price=entry_price * 0.95 if entry_price else None,
        reason=reason,
        signal_confidence=confidence,
        evaluated_at=datetime.now(timezone.utc),
    )
