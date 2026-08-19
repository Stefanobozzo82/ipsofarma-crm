"""Caricamento di `config/strategies.yaml`.

Segue lo stesso pattern dichiarativo di `config/risk_limits.yaml` e
`config/assets.yaml`: le regole (finestre delle medie mobili, soglie RSI,
soglie di volatilità, filtri fondamentali) sono dati di configurazione, non
codice, così da poter essere riviste senza toccare le strategie.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from config.settings import CONFIG_DIR
from trading_system.common.exceptions import ConfigurationError

STRATEGIES_CONFIG_PATH = CONFIG_DIR / "strategies.yaml"


def load_strategy_config(path: Path | None = None) -> dict:
    """Legge e ritorna il dizionario di configurazione delle strategie.

    Solleva `ConfigurationError` se il file manca o non è YAML valido:
    lo strategy engine non deve mai partire con regole implicite/inventate.
    """
    config_path = path or STRATEGIES_CONFIG_PATH
    if not config_path.exists():
        raise ConfigurationError(f"File di configurazione strategie non trovato: {config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        raise ConfigurationError(f"File di configurazione strategie non valido ({config_path}): {exc}") from exc

    return config
