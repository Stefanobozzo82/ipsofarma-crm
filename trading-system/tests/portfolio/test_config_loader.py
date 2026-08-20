"""Test del caricamento/validazione di config/portfolio.yaml."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
import yaml

from tests.portfolio.conftest import VALID_PORTFOLIO_DICT
from tests.risk_management.conftest import build_config
from trading_system.common.exceptions import ConfigurationError
from trading_system.portfolio.config_loader import load_portfolio_config


def _write_yaml(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "portfolio.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


def test_valid_config_loads_successfully(tmp_path: Path):
    path = _write_yaml(tmp_path, VALID_PORTFOLIO_DICT)

    config = load_portfolio_config(build_config(), path)

    assert config.active_profile == "balanced"
    assert config.active().equity == 30.0
    assert config.active().etf == 50.0
    assert config.active().crypto == 10.0


def test_missing_file_raises_configuration_error(tmp_path: Path):
    with pytest.raises(ConfigurationError):
        load_portfolio_config(build_config(), tmp_path / "does_not_exist.yaml")


def test_invalid_yaml_raises_configuration_error(tmp_path: Path):
    path = tmp_path / "bad.yaml"
    path.write_text("profiles: [unbalanced", encoding="utf-8")
    with pytest.raises(ConfigurationError):
        load_portfolio_config(build_config(), path)


def test_unknown_active_profile_raises(tmp_path: Path):
    data = copy.deepcopy(VALID_PORTFOLIO_DICT)
    data["active_profile"] = "does_not_exist"
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="does_not_exist"):
        load_portfolio_config(build_config(), path)


def test_weights_summing_over_100_raises(tmp_path: Path):
    data = copy.deepcopy(VALID_PORTFOLIO_DICT)
    data["profiles"]["balanced"] = {"equity": 50.0, "etf": 40.0, "crypto": 20.0}  # somma 110
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="100"):
        load_portfolio_config(build_config(), path)


def test_profile_exceeding_risk_ceiling_raises(tmp_path: Path):
    data = copy.deepcopy(VALID_PORTFOLIO_DICT)
    # build_config() ha crypto.max_portfolio_pct=15.0
    data["profiles"]["aggressive"]["crypto"] = 20.0
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="crypto"):
        load_portfolio_config(build_config(), path)


def test_shipped_default_config_is_valid_against_a_compiled_risk_config():
    # config/portfolio.yaml, così come distribuito, deve essere internamente
    # coerente con un config/risk_limits.yaml plausibile.
    config = load_portfolio_config(build_config())

    assert config.active_profile in config.profiles
