"""Test del caricamento/validazione di config/backtesting.yaml."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
import yaml

from trading_system.common.exceptions import ConfigurationError
from trading_system.backtesting.config_loader import load_backtesting_config

VALID_CONFIG_DICT = {
    "commission_pct": 0.10,
    "slippage_pct": 0.05,
    "initial_equity": 100_000.0,
    "eligibility": {
        "min_trades": 10,
        "min_sharpe_ratio": 0.5,
        "max_drawdown_pct": 25.0,
        "min_win_rate_pct": 40.0,
    },
}


def _write_yaml(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "backtesting.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


def test_valid_config_loads_successfully(tmp_path: Path):
    path = _write_yaml(tmp_path, VALID_CONFIG_DICT)

    config = load_backtesting_config(path)

    assert config.initial_equity == 100_000.0
    assert config.eligibility.min_trades == 10


def test_missing_file_raises_configuration_error(tmp_path: Path):
    with pytest.raises(ConfigurationError):
        load_backtesting_config(tmp_path / "does_not_exist.yaml")


def test_invalid_yaml_raises_configuration_error(tmp_path: Path):
    path = tmp_path / "bad.yaml"
    path.write_text("eligibility: [unbalanced", encoding="utf-8")
    with pytest.raises(ConfigurationError):
        load_backtesting_config(path)


def test_non_positive_initial_equity_rejected(tmp_path: Path):
    data = copy.deepcopy(VALID_CONFIG_DICT)
    data["initial_equity"] = 0.0
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError):
        load_backtesting_config(path)


def test_missing_eligibility_section_rejected(tmp_path: Path):
    data = copy.deepcopy(VALID_CONFIG_DICT)
    del data["eligibility"]
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError):
        load_backtesting_config(path)


def test_shipped_default_config_loads_successfully():
    config = load_backtesting_config()

    assert config.initial_equity > 0
    assert config.eligibility.min_trades >= 1
