"""Orchestratore dello strategy engine.

Costruisce le strategie abilitate in `config/strategies.yaml` e le esegue
per asset class. Non decide *quanto* investire né *se* un segnale può
diventare un ordine reale — quello è compito dei moduli 3 (risk management)
e 4 (portfolio allocator): questo modulo produce solo `Signal` tracciabili.
"""

from __future__ import annotations

import pandas as pd

from trading_system.common.enums import AssetClass
from trading_system.common.exceptions import ConfigurationError
from trading_system.common.logging_config import get_logger
from trading_system.common.models import Signal
from trading_system.strategy_engine.base import Strategy
from trading_system.strategy_engine.config_loader import load_strategy_config
from trading_system.strategy_engine.crypto_strategies import RSIVolatilityStrategy
from trading_system.strategy_engine.equity_strategies import (
    EquityMovingAverageFundamentalsStrategy,
)
from trading_system.strategy_engine.etf_strategies import MovingAverageCrossoverStrategy

logger = get_logger(__name__)


def _build_etf_strategies(config: dict) -> list[Strategy]:
    strategies: list[Strategy] = []
    ma_config = config.get("etf", {}).get("moving_average", {})
    if ma_config.get("enabled"):
        strategies.append(
            MovingAverageCrossoverStrategy(
                short_window=ma_config.get("short_window", 20),
                long_window=ma_config.get("long_window", 50),
                confidence_scale_pct=ma_config.get("confidence_scale_pct", 5.0),
            )
        )
    return strategies


def _build_equity_strategies(config: dict) -> list[Strategy]:
    strategies: list[Strategy] = []
    equity_config = config.get("equity", {})
    ma_config = equity_config.get("moving_average", {})
    fundamentals_config = equity_config.get("fundamentals", {})
    if ma_config.get("enabled"):
        kwargs = dict(
            short_window=ma_config.get("short_window", 20),
            long_window=ma_config.get("long_window", 50),
            confidence_scale_pct=ma_config.get("confidence_scale_pct", 5.0),
        )
        if fundamentals_config.get("enabled"):
            kwargs.update(
                max_pe_ratio=fundamentals_config.get("max_pe_ratio", 30.0),
                min_return_on_equity=fundamentals_config.get("min_return_on_equity", 0.10),
                max_debt_to_equity=fundamentals_config.get("max_debt_to_equity", 200.0),
                min_revenue_growth=fundamentals_config.get("min_revenue_growth", 0.0),
                veto_below_score=fundamentals_config.get("veto_below_score", 0.5),
            )
        strategies.append(EquityMovingAverageFundamentalsStrategy(**kwargs))
    return strategies


def _build_crypto_strategies(config: dict) -> list[Strategy]:
    strategies: list[Strategy] = []
    rsi_config = config.get("crypto", {}).get("rsi_volatility", {})
    if rsi_config.get("enabled"):
        strategies.append(
            RSIVolatilityStrategy(
                rsi_period=rsi_config.get("rsi_period", 14),
                rsi_oversold=rsi_config.get("rsi_oversold", 30.0),
                rsi_overbought=rsi_config.get("rsi_overbought", 70.0),
                volatility_window=rsi_config.get("volatility_window", 20),
                max_volatility_annualized=rsi_config.get("max_volatility_annualized", 0.80),
            )
        )
    return strategies


class StrategyEngine:
    """Registro ed esecutore delle strategie abilitate, per asset class."""

    def __init__(self, config: dict | None = None) -> None:
        self._config = config if config is not None else load_strategy_config()
        self._strategies: dict[AssetClass, list[Strategy]] = {
            AssetClass.ETF: _build_etf_strategies(self._config),
            AssetClass.EQUITY: _build_equity_strategies(self._config),
            AssetClass.CRYPTO: _build_crypto_strategies(self._config),
        }
        for asset_class, strategies in self._strategies.items():
            logger.info(
                "Strategie attive | asset_class=%s strategie=%s",
                asset_class.value, [s.name for s in strategies],
            )

    def strategies_for(self, asset_class: AssetClass) -> list[Strategy]:
        return list(self._strategies.get(asset_class, []))

    def generate_signals(
        self,
        symbol: str,
        asset_class: AssetClass,
        bars: pd.DataFrame,
        **context,
    ) -> list[Signal]:
        """Esegue tutte le strategie abilitate per `asset_class` su `symbol`.

        Ritorna un segnale per strategia (anche più strategie sullo stesso
        simbolo possono essere abilitate in futuro): il chiamante decide come
        aggregarle. Nessuna eccezione da una singola strategia deve bloccare
        le altre — viene loggata e quella strategia produce nessun segnale.
        """
        strategies = self._strategies.get(asset_class, [])
        if not strategies:
            raise ConfigurationError(
                f"Nessuna strategia abilitata per asset_class={asset_class.value} "
                f"in config/strategies.yaml."
            )

        signals: list[Signal] = []
        for strategy in strategies:
            try:
                signal = strategy.generate_signal(symbol, bars, **context)
            except Exception:
                logger.exception(
                    "Errore nella strategia '%s' su symbol=%s: segnale scartato.",
                    strategy.name, symbol,
                )
                continue
            logger.info(
                "Segnale generato | strategy=%s symbol=%s action=%s confidence=%.2f",
                strategy.name, symbol, signal.action.value, signal.confidence,
            )
            signals.append(signal)
        return signals
