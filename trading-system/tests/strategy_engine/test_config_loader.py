"""Test del caricamento di config/strategies.yaml."""

from __future__ import annotations

from pathlib import Path

import pytest

from trading_system.common.exceptions import ConfigurationError
from trading_system.strategy_engine.config_loader import load_strategy_config


def test_loads_real_config_file():
    config = load_strategy_config()

    assert config["etf"]["moving_average"]["enabled"] is True
    assert config["crypto"]["rsi_volatility"]["enabled"] is True
    assert config["equity"]["moving_average"]["enabled"] is True


def test_missing_file_raises_configuration_error(tmp_path: Path):
    missing = tmp_path / "does_not_exist.yaml"
    with pytest.raises(ConfigurationError):
        load_strategy_config(missing)


def test_invalid_yaml_raises_configuration_error(tmp_path: Path):
    bad_file = tmp_path / "bad.yaml"
    bad_file.write_text("etf: [unbalanced", encoding="utf-8")
    with pytest.raises(ConfigurationError):
        load_strategy_config(bad_file)
