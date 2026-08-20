"""Caricamento e validazione di `config/scheduler.yaml`.

Non è un file "safety-critical" come `risk_limits.yaml`: controlla solo
QUANDO gira il ciclo autonomo (modulo 8), mai con che soldi — quello resta
deciso da `config/execution.yaml` (`mode: paper` di default) e, a monte, da
`config/risk_limits.yaml`. Per questo può spedire con un default sensato e
già abilitato, seguendo lo stesso principio già usato per
`strategies.yaml`/`backtesting.yaml`/`execution.yaml`.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field, model_validator

from config.settings import SCHEDULER_CONFIG_PATH
from trading_system.common.exceptions import ConfigurationError

_VALID_CADENCES = ("daily", "interval_hours")


class SchedulerConfig(BaseModel):
    """Configurazione validata dello scheduler autonomo."""

    enabled: bool
    cadence: str  # validato esplicitamente sotto, non con un Literal, per un messaggio d'errore più chiaro
    run_at_utc: str | None = None
    interval_hours: float | None = Field(default=None, gt=0.0)
    data_lookback_days: int = Field(gt=0)

    @model_validator(mode="after")
    def _cadence_has_required_field(self) -> "SchedulerConfig":
        if self.cadence == "daily" and not self.run_at_utc:
            raise ValueError("cadence='daily' richiede 'run_at_utc' (formato 'HH:MM', UTC).")
        if self.cadence == "interval_hours" and self.interval_hours is None:
            raise ValueError("cadence='interval_hours' richiede 'interval_hours' (> 0).")
        if self.cadence == "daily" and self.run_at_utc is not None:
            _parse_run_at_utc(self.run_at_utc)
        return self


def _parse_run_at_utc(value: str) -> tuple[int, int]:
    try:
        hour_str, minute_str = value.split(":")
        hour, minute = int(hour_str), int(minute_str)
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
        return hour, minute
    except ValueError as exc:
        raise ValueError(f"run_at_utc='{value}' non è un orario valido (atteso 'HH:MM', 24h).") from exc


def load_scheduler_config(path: Path | None = None) -> SchedulerConfig:
    """Legge e valida `config/scheduler.yaml`. Solleva `ConfigurationError` su qualunque problema."""
    config_path = path or SCHEDULER_CONFIG_PATH
    if not config_path.exists():
        raise ConfigurationError(f"File di configurazione dello scheduler non trovato: {config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        raise ConfigurationError(f"config/scheduler.yaml non è YAML valido: {exc}") from exc

    try:
        config = SchedulerConfig(**raw)
    except Exception as exc:
        raise ConfigurationError(f"config/scheduler.yaml non è valido: {exc}") from exc

    if config.cadence not in _VALID_CADENCES:
        raise ConfigurationError(
            f"config/scheduler.yaml: cadence='{config.cadence}' non valida (attese: {_VALID_CADENCES})."
        )

    return config
