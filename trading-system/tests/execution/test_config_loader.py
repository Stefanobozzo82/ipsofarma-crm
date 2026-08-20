"""Test del caricamento/validazione di config/execution.yaml."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
import yaml

from tests.execution.conftest import VALID_EXECUTION_CONFIG_DICT
from trading_system.common.exceptions import ConfigurationError
from trading_system.execution.config_loader import load_execution_config


def _write_yaml(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "execution.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


def test_valid_config_loads_successfully(tmp_path: Path):
    path = _write_yaml(tmp_path, VALID_EXECUTION_CONFIG_DICT)

    config = load_execution_config(path)

    assert config.mode == "paper"
    assert config.paper.initial_cash == 100_000.0
    assert config.live_brokers.crypto == "kraken"


def test_missing_file_raises_configuration_error(tmp_path: Path):
    with pytest.raises(ConfigurationError):
        load_execution_config(tmp_path / "does_not_exist.yaml")


def test_invalid_yaml_raises_configuration_error(tmp_path: Path):
    path = tmp_path / "bad.yaml"
    path.write_text("paper: [unbalanced", encoding="utf-8")
    with pytest.raises(ConfigurationError):
        load_execution_config(path)


def test_invalid_mode_rejected(tmp_path: Path):
    data = copy.deepcopy(VALID_EXECUTION_CONFIG_DICT)
    data["mode"] = "yolo"
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="yolo"):
        load_execution_config(path)


def test_non_positive_initial_cash_rejected(tmp_path: Path):
    data = copy.deepcopy(VALID_EXECUTION_CONFIG_DICT)
    data["paper"]["initial_cash"] = 0.0
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError):
        load_execution_config(path)


def test_shipped_default_config_loads_as_paper_mode():
    config = load_execution_config()

    assert config.mode == "paper"  # sicuro di default, come richiesto dalla specifica di prodotto
