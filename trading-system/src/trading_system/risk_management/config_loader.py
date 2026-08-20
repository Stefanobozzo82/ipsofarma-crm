"""Caricamento e validazione di `config/risk_limits.yaml`.

Questo loader è il punto in cui il vincolo di prodotto "nessuna operazione
senza limiti di rischio impostati esplicitamente" e "le crypto sono sempre
più rischiose di azioni/ETF" diventano controlli reali, non solo commenti
nel file YAML:

- il file deve avere `enabled: true` a livello globale E per ogni singola
  asset class che si vuole usare, con tutti i valori numerici compilati
  (nessun `null`, nessun placeholder implicito a zero);
- i limiti su crypto (`max_portfolio_pct`, `stop_loss_pct`,
  `max_volatility_annualized`) devono essere sempre più stringenti di
  quelli su azioni ED ETF.

Qualunque violazione solleva `ConfigurationError`: nessun modulo a valle
(risk manager, execution) può partire con una configurazione parziale o
incoerente.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field

from config.settings import RISK_LIMITS_PATH
from trading_system.common.enums import AssetClass
from trading_system.common.exceptions import ConfigurationError


class AssetClassRiskLimits(BaseModel):
    """Limiti di rischio per una singola asset class, tutti obbligatori una volta abilitata."""

    enabled: bool
    max_portfolio_pct: float = Field(gt=0.0, le=100.0)
    max_position_pct: float = Field(gt=0.0, le=100.0)
    stop_loss_pct: float = Field(gt=0.0, le=100.0)
    max_volatility_annualized: float = Field(gt=0.0)


class PortfolioRiskLimits(BaseModel):
    """Limiti aggregati sull'intero portafoglio (tutte le asset class insieme)."""

    max_drawdown_pct: float = Field(gt=0.0, le=100.0)
    max_daily_loss_pct: float = Field(gt=0.0, le=100.0)


class RiskLimitsConfig(BaseModel):
    """Configurazione dei limiti di rischio, validata e pronta all'uso dal risk manager."""

    version: int
    enabled: bool
    equity: AssetClassRiskLimits
    etf: AssetClassRiskLimits
    crypto: AssetClassRiskLimits
    portfolio: PortfolioRiskLimits

    def limits_for(self, asset_class: AssetClass) -> AssetClassRiskLimits:
        return {
            AssetClass.EQUITY: self.equity,
            AssetClass.ETF: self.etf,
            AssetClass.CRYPTO: self.crypto,
        }[asset_class]


def _require_compiled(raw: dict, path: str) -> dict:
    """Verifica che una sezione asset-class non contenga `null` residui dal template."""
    for key, value in raw.items():
        if value is None:
            raise ConfigurationError(
                f"config/risk_limits.yaml: '{path}.{key}' non è compilato (null). "
                f"Imposta esplicitamente un valore prima di abilitare questa asset class."
            )
    return raw


def load_risk_limits(path: Path | None = None) -> RiskLimitsConfig:
    """Legge, valida e ritorna i limiti di rischio.

    Solleva `ConfigurationError` (non un'eccezione pydantic generica) per
    qualunque problema: file mancante, YAML invalido, sezione non abilitata,
    valore non compilato, o vincolo crypto-più-stringente violato. È
    volutamente "fail loud": il risk manager non deve mai operare con una
    configurazione ambigua.
    """
    config_path = path or RISK_LIMITS_PATH
    if not config_path.exists():
        raise ConfigurationError(f"File dei limiti di rischio non trovato: {config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        raise ConfigurationError(f"config/risk_limits.yaml non è YAML valido: {exc}") from exc

    if not raw.get("enabled"):
        raise ConfigurationError(
            "config/risk_limits.yaml ha 'enabled: false' (o non impostato): nessuna operazione "
            "può essere autorizzata finché non lo abiliti esplicitamente dopo aver rivisto i limiti."
        )

    try:
        asset_sections = {
            asset_class: _require_compiled(raw.get(asset_class, {}) or {}, asset_class)
            for asset_class in ("equity", "etf", "crypto")
        }
        config = RiskLimitsConfig(
            version=raw.get("version", 1),
            enabled=raw["enabled"],
            equity=AssetClassRiskLimits(**asset_sections["equity"]),
            etf=AssetClassRiskLimits(**asset_sections["etf"]),
            crypto=AssetClassRiskLimits(**asset_sections["crypto"]),
            portfolio=PortfolioRiskLimits(**(raw.get("portfolio", {}) or {})),
        )
    except ConfigurationError:
        raise
    except Exception as exc:
        raise ConfigurationError(f"config/risk_limits.yaml non è valido: {exc}") from exc

    _validate_crypto_is_stricter(config)
    return config


def _validate_crypto_is_stricter(config: RiskLimitsConfig) -> None:
    """Vincolo di prodotto non negoziabile: crypto sempre più rischiosa/limitata.

    Il confronto è per-coppia: crypto viene confrontata solo con le asset
    class attualmente abilitate (non ha senso vietare un limite crypto
    "largo" rispetto a un'asset class che comunque non verrà tradata). Se
    crypto stessa è disabilitata, il confronto non si applica.
    """
    crypto = config.crypto
    if not crypto.enabled:
        return

    others = {"equity": config.equity, "etf": config.etf}
    enabled_others = {name: limits for name, limits in others.items() if limits.enabled}
    if not enabled_others:
        return

    fields = [
        ("max_portfolio_pct", "deve essere <="),
        ("stop_loss_pct", "deve essere <= (stop più stretto = valore più piccolo)"),
        ("max_volatility_annualized", "deve essere <="),
    ]

    violations: list[str] = []
    for field_name, requirement in fields:
        crypto_value = getattr(crypto, field_name)
        offenders = {
            name: getattr(limits, field_name)
            for name, limits in enabled_others.items()
            if crypto_value > getattr(limits, field_name)
        }
        if offenders:
            offenders_str = ", ".join(f"{name}.{field_name} ({value})" for name, value in offenders.items())
            violations.append(f"crypto.{field_name} ({crypto_value}) {requirement} {offenders_str}")

    if violations:
        raise ConfigurationError(
            "config/risk_limits.yaml viola il vincolo di prodotto 'crypto sempre più stringente "
            "delle asset class abilitate': " + "; ".join(violations)
        )
