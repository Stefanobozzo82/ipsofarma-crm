"""Caricamento e validazione di `config/execution.yaml`."""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from config.settings import CONFIG_DIR
from trading_system.common.exceptions import ConfigurationError

EXECUTION_CONFIG_PATH = CONFIG_DIR / "execution.yaml"


class PaperConfig(BaseModel):
    initial_cash: float = Field(gt=0.0)
    commission_pct: float = Field(ge=0.0, le=100.0)


class LiveBrokersConfig(BaseModel):
    equity: str
    etf: str
    crypto: str


class LiveGateConfig(BaseModel):
    max_backtest_age_days: int = Field(ge=1)
    min_paper_trading_days: int = Field(ge=0)
    min_paper_trades: int = Field(ge=0)


class ExecutionConfig(BaseModel):
    mode: str  # "paper" | "live" — validato esplicitamente sotto, non con un Literal per un messaggio d'errore più chiaro
    paper: PaperConfig
    live_brokers: LiveBrokersConfig
    live_gate: LiveGateConfig


def load_execution_config(path: Path | None = None) -> ExecutionConfig:
    """Legge e valida `config/execution.yaml`. Solleva `ConfigurationError` su qualunque problema."""
    config_path = path or EXECUTION_CONFIG_PATH
    if not config_path.exists():
        raise ConfigurationError(f"File di configurazione dell'execution layer non trovato: {config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        raise ConfigurationError(f"config/execution.yaml non è YAML valido: {exc}") from exc

    try:
        config = ExecutionConfig(**raw)
    except Exception as exc:
        raise ConfigurationError(f"config/execution.yaml non è valido: {exc}") from exc

    if config.mode not in ("paper", "live"):
        raise ConfigurationError(f"config/execution.yaml: mode='{config.mode}' non valido (atteso 'paper' o 'live').")

    return config
