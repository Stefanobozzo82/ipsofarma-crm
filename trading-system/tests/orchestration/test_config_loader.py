"""Test del caricamento/validazione di config/scheduler.yaml."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
import yaml

from trading_system.common.exceptions import ConfigurationError
from trading_system.orchestration.config_loader import load_scheduler_config

VALID_DAILY_DICT = {
    "enabled": True,
    "cadence": "daily",
    "run_at_utc": "06:00",
    "interval_hours": None,
    "data_lookback_days": 30,
}


def _write_yaml(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "scheduler.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


def test_valid_daily_config_loads_successfully(tmp_path: Path):
    path = _write_yaml(tmp_path, VALID_DAILY_DICT)

    config = load_scheduler_config(path)

    assert config.enabled is True
    assert config.cadence == "daily"
    assert config.run_at_utc == "06:00"


def test_valid_interval_hours_config_loads_successfully(tmp_path: Path):
    data = copy.deepcopy(VALID_DAILY_DICT)
    data["cadence"] = "interval_hours"
    data["run_at_utc"] = None
    data["interval_hours"] = 4
    path = _write_yaml(tmp_path, data)

    config = load_scheduler_config(path)

    assert config.cadence == "interval_hours"
    assert config.interval_hours == 4


def test_missing_file_raises_configuration_error(tmp_path: Path):
    with pytest.raises(ConfigurationError):
        load_scheduler_config(tmp_path / "does_not_exist.yaml")


def test_invalid_yaml_raises_configuration_error(tmp_path: Path):
    path = tmp_path / "bad.yaml"
    path.write_text("cadence: [unbalanced", encoding="utf-8")
    with pytest.raises(ConfigurationError):
        load_scheduler_config(path)


def test_daily_cadence_without_run_at_utc_raises(tmp_path: Path):
    data = copy.deepcopy(VALID_DAILY_DICT)
    data["run_at_utc"] = None
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="run_at_utc"):
        load_scheduler_config(path)


def test_interval_hours_cadence_without_value_raises(tmp_path: Path):
    data = copy.deepcopy(VALID_DAILY_DICT)
    data["cadence"] = "interval_hours"
    data["run_at_utc"] = None
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="interval_hours"):
        load_scheduler_config(path)


def test_invalid_run_at_utc_format_raises(tmp_path: Path):
    data = copy.deepcopy(VALID_DAILY_DICT)
    data["run_at_utc"] = "not-a-time"
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="run_at_utc"):
        load_scheduler_config(path)


def test_unknown_cadence_raises(tmp_path: Path):
    data = copy.deepcopy(VALID_DAILY_DICT)
    data["cadence"] = "weekly"
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="cadence"):
        load_scheduler_config(path)


def test_shipped_default_config_loads_successfully():
    # config/scheduler.yaml, così come distribuito, deve essere valido e
    # già utilizzabile (a differenza di risk_limits.yaml, non è un file
    # "safety-critical": controlla solo la cadenza, non il rischio).
    config = load_scheduler_config()

    assert config.enabled is True
    assert config.cadence in ("daily", "interval_hours")
