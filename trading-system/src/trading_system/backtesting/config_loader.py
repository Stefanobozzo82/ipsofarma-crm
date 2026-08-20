"""Caricamento e validazione di `config/backtesting.yaml`."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from config.settings import CONFIG_DIR
from trading_system.common.exceptions import ConfigurationError

BACKTESTING_CONFIG_PATH = CONFIG_DIR / "backtesting.yaml"


class EligibilityCriteria(BaseModel):
    """Soglie minime perché un `BacktestResult` sia considerato positivo."""

    min_trades: int = Field(ge=1)
    min_sharpe_ratio: float
    max_drawdown_pct: float = Field(gt=0.0, le=100.0)
    min_win_rate_pct: float = Field(ge=0.0, le=100.0)


class BacktestingConfig(BaseModel):
    """Configurazione del motore di backtest, validata e pronta all'uso."""

    commission_pct: float = Field(ge=0.0, le=100.0)
    slippage_pct: float = Field(ge=0.0, le=100.0)
    initial_equity: float = Field(gt=0.0)
    eligibility: EligibilityCriteria


def load_backtesting_config(path: Path | None = None) -> BacktestingConfig:
    """Legge e valida `config/backtesting.yaml`. Solleva `ConfigurationError` su qualunque problema."""
    config_path = path or BACKTESTING_CONFIG_PATH
    if not config_path.exists():
        raise ConfigurationError(f"File di configurazione del backtest non trovato: {config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        raise ConfigurationError(f"config/backtesting.yaml non è YAML valido: {exc}") from exc

    try:
        return BacktestingConfig(**raw)
    except Exception as exc:
        raise ConfigurationError(f"config/backtesting.yaml non è valido: {exc}") from exc
