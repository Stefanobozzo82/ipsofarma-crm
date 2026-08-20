"""Test del caricamento/validazione di config/risk_limits.yaml."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
import yaml

from tests.risk_management.conftest import VALID_CONFIG_DICT
from trading_system.common.enums import AssetClass
from trading_system.common.exceptions import ConfigurationError
from trading_system.risk_management.config_loader import load_risk_limits


def _write_yaml(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "risk_limits.yaml"
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


def test_valid_config_loads_successfully(tmp_path: Path):
    path = _write_yaml(tmp_path, VALID_CONFIG_DICT)

    config = load_risk_limits(path)

    assert config.enabled is True
    assert config.limits_for(AssetClass.CRYPTO).max_portfolio_pct == 15.0
    assert config.limits_for(AssetClass.EQUITY).max_portfolio_pct == 60.0


def test_missing_file_raises_configuration_error(tmp_path: Path):
    with pytest.raises(ConfigurationError):
        load_risk_limits(tmp_path / "does_not_exist.yaml")


def test_invalid_yaml_raises_configuration_error(tmp_path: Path):
    path = tmp_path / "bad.yaml"
    path.write_text("equity: [unbalanced", encoding="utf-8")
    with pytest.raises(ConfigurationError):
        load_risk_limits(path)


def test_globally_disabled_raises_configuration_error(tmp_path: Path):
    data = copy.deepcopy(VALID_CONFIG_DICT)
    data["enabled"] = False
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="enabled: false"):
        load_risk_limits(path)


def test_shipped_default_config_is_disabled_by_default():
    # config/risk_limits.yaml, così come distribuito nel repo, non deve mai
    # autorizzare operazioni finché l'utente non lo compila esplicitamente.
    with pytest.raises(ConfigurationError):
        load_risk_limits()


@pytest.mark.parametrize("asset_class", ["equity", "etf", "crypto"])
@pytest.mark.parametrize(
    "field", ["max_portfolio_pct", "max_position_pct", "stop_loss_pct", "max_volatility_annualized"]
)
def test_uncompiled_field_raises_configuration_error(tmp_path: Path, asset_class: str, field: str):
    data = copy.deepcopy(VALID_CONFIG_DICT)
    data[asset_class][field] = None
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match=f"{asset_class}.{field}"):
        load_risk_limits(path)


def test_crypto_max_portfolio_pct_must_be_stricter(tmp_path: Path):
    data = copy.deepcopy(VALID_CONFIG_DICT)
    data["crypto"]["max_portfolio_pct"] = 90.0  # ben oltre equity/etf
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="crypto.max_portfolio_pct"):
        load_risk_limits(path)


def test_crypto_stop_loss_must_be_stricter(tmp_path: Path):
    data = copy.deepcopy(VALID_CONFIG_DICT)
    data["crypto"]["stop_loss_pct"] = 20.0  # più largo (meno stringente) di equity/etf
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="crypto.stop_loss_pct"):
        load_risk_limits(path)


def test_crypto_volatility_threshold_must_be_stricter(tmp_path: Path):
    data = copy.deepcopy(VALID_CONFIG_DICT)
    data["crypto"]["max_volatility_annualized"] = 0.90
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="crypto.max_volatility_annualized"):
        load_risk_limits(path)


def test_crypto_constraint_skipped_if_all_other_asset_classes_disabled(tmp_path: Path):
    # Il confronto "crypto più stringente" ha senso solo tra asset class
    # tutte abilitate: se equity ed etf sono entrambe disabilitate, un
    # limite crypto "largo" non viola nulla (nessun altro asset con cui
    # confrontarlo verrà comunque tradato).
    data = copy.deepcopy(VALID_CONFIG_DICT)
    data["crypto"]["max_portfolio_pct"] = 90.0
    data["equity"]["enabled"] = False
    data["etf"]["enabled"] = False
    path = _write_yaml(tmp_path, data)

    config = load_risk_limits(path)

    assert config.crypto.max_portfolio_pct == 90.0


def test_crypto_constraint_still_applies_if_only_one_other_class_disabled(tmp_path: Path):
    # Se equity è disabilitata ma etf resta abilitato, il confronto con etf
    # continua a valere.
    data = copy.deepcopy(VALID_CONFIG_DICT)
    data["crypto"]["max_portfolio_pct"] = 90.0
    data["equity"]["enabled"] = False
    path = _write_yaml(tmp_path, data)

    with pytest.raises(ConfigurationError, match="crypto.max_portfolio_pct"):
        load_risk_limits(path)
