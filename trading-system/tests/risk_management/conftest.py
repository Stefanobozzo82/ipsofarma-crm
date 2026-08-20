"""Fixture/helper condivisi per i test del risk management.

`VALID_CONFIG_DICT` è una configurazione completa e coerente (rispetta il
vincolo "crypto sempre più stringente"), usata come base per i test che
devono partire da limiti validi e violarne uno specifico.
"""

from __future__ import annotations

import copy

from trading_system.risk_management.config_loader import RiskLimitsConfig

VALID_CONFIG_DICT = {
    "version": 1,
    "enabled": True,
    "equity": {
        "enabled": True,
        "max_portfolio_pct": 60.0,
        "max_position_pct": 10.0,
        "stop_loss_pct": 8.0,
        "max_volatility_annualized": 0.40,
    },
    "etf": {
        "enabled": True,
        "max_portfolio_pct": 70.0,
        "max_position_pct": 15.0,
        "stop_loss_pct": 6.0,
        "max_volatility_annualized": 0.30,
    },
    "crypto": {
        "enabled": True,
        "max_portfolio_pct": 15.0,
        "max_position_pct": 5.0,
        "stop_loss_pct": 5.0,
        "max_volatility_annualized": 0.25,
    },
    "portfolio": {
        "max_drawdown_pct": 20.0,
        "max_daily_loss_pct": 5.0,
    },
}


def build_config(**overrides) -> RiskLimitsConfig:
    """Costruisce una `RiskLimitsConfig` valida, applicando eventuali override.

    `overrides` è un dict annidato parziale, es.
    `build_config(crypto={"max_portfolio_pct": 90.0})` per violare
    volutamente il vincolo crypto-più-stringente in un test.
    """
    data = copy.deepcopy(VALID_CONFIG_DICT)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(data.get(key), dict):
            data[key].update(value)
        else:
            data[key] = value
    return RiskLimitsConfig(**data)
