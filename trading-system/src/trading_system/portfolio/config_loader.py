"""Caricamento e validazione di `config/portfolio.yaml`.

I pesi target di ogni profilo sono una **preferenza**, non un tetto di
sicurezza: il tetto di sicurezza resta `config/risk_limits.yaml` (modulo 3).
Per questo `load_portfolio_config` richiede sempre una `RiskLimitsConfig`
già validata (vedi `trading_system.risk_management.load_risk_limits`) e
rifiuta qualunque profilo che, per una asset class, superi il rispettivo
`max_portfolio_pct` — non è possibile costruire un `PortfolioAllocator` con
un profilo che aggira i limiti di rischio.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field, model_validator

from config.settings import CONFIG_DIR
from trading_system.common.enums import AssetClass
from trading_system.common.exceptions import ConfigurationError
from trading_system.risk_management.config_loader import RiskLimitsConfig

PORTFOLIO_CONFIG_PATH = CONFIG_DIR / "portfolio.yaml"


class AllocationProfile(BaseModel):
    """Pesi target (percentuali dell'equity totale) per un profilo di rischio."""

    equity: float = Field(ge=0.0, le=100.0)
    etf: float = Field(ge=0.0, le=100.0)
    crypto: float = Field(ge=0.0, le=100.0)

    @model_validator(mode="after")
    def _weights_do_not_exceed_total(self) -> "AllocationProfile":
        total = self.equity + self.etf + self.crypto
        if total > 100.0 + 1e-9:
            raise ValueError(f"la somma dei pesi ({total:.2f}%) supera il 100% dell'equity")
        return self

    def weight_for(self, asset_class: AssetClass) -> float:
        return {
            AssetClass.EQUITY: self.equity,
            AssetClass.ETF: self.etf,
            AssetClass.CRYPTO: self.crypto,
        }[asset_class]


class PortfolioConfig(BaseModel):
    """Configurazione di allocazione validata, pronta all'uso da `PortfolioAllocator`."""

    active_profile: str
    rebalance_threshold_pct: float = Field(gt=0.0, le=100.0)
    profiles: dict[str, AllocationProfile]

    @model_validator(mode="after")
    def _active_profile_exists(self) -> "PortfolioConfig":
        if self.active_profile not in self.profiles:
            raise ValueError(
                f"active_profile='{self.active_profile}' non è definito in 'profiles' "
                f"(disponibili: {sorted(self.profiles)})"
            )
        return self

    def active(self) -> AllocationProfile:
        return self.profiles[self.active_profile]


def load_portfolio_config(
    risk_limits: RiskLimitsConfig,
    path: Path | None = None,
) -> PortfolioConfig:
    """Legge, valida e ritorna la configurazione di allocazione del portafoglio.

    `risk_limits` deve essere già stata caricata e validata (vedi
    `trading_system.risk_management.load_risk_limits`): ogni profilo qui
    viene confrontato contro i suoi `max_portfolio_pct` per asset class.
    """
    config_path = path or PORTFOLIO_CONFIG_PATH
    if not config_path.exists():
        raise ConfigurationError(f"File di configurazione del portafoglio non trovato: {config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
    except yaml.YAMLError as exc:
        raise ConfigurationError(f"config/portfolio.yaml non è YAML valido: {exc}") from exc

    try:
        config = PortfolioConfig(**raw)
    except Exception as exc:
        raise ConfigurationError(f"config/portfolio.yaml non è valido: {exc}") from exc

    _validate_within_risk_ceilings(config, risk_limits)
    return config


def _validate_within_risk_ceilings(config: PortfolioConfig, risk_limits: RiskLimitsConfig) -> None:
    violations: list[str] = []
    for profile_name, profile in config.profiles.items():
        for asset_class in (AssetClass.EQUITY, AssetClass.ETF, AssetClass.CRYPTO):
            target_weight = profile.weight_for(asset_class)
            ceiling = risk_limits.limits_for(asset_class).max_portfolio_pct
            if target_weight > ceiling:
                violations.append(
                    f"profilo '{profile_name}': {asset_class.value}={target_weight:.1f}% "
                    f"supera il tetto di rischio max_portfolio_pct={ceiling:.1f}%"
                )

    if violations:
        raise ConfigurationError(
            "config/portfolio.yaml contiene profili che superano i limiti di rischio "
            "(config/risk_limits.yaml): " + "; ".join(violations)
        )
