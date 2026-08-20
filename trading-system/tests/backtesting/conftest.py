"""Fixture/helper condivisi per i test del modulo di backtesting.

Gli scenari di prezzo sono costruiti a mano (nessun random) in modo da
sapere esattamente quando la strategia (media mobile 3/8 su ETF) apre e
chiude una posizione: è l'unico modo per fare assert precisi su un motore
che orchestra strategy engine + risk manager reali invece di mockarli.
"""

from __future__ import annotations

import pandas as pd

from trading_system.backtesting.config_loader import BacktestingConfig, EligibilityCriteria
from trading_system.backtesting.engine import BacktestEngine
from trading_system.risk_management.config_loader import RiskLimitsConfig
from trading_system.risk_management.risk_manager import RiskManager
from trading_system.strategy_engine.engine import StrategyEngine

# Solo la strategia ETF a media mobile abilitata, finestre corte per poter
# costruire scenari di test con poche barre.
STRATEGY_CONFIG = {
    "etf": {"moving_average": {"enabled": True, "short_window": 3, "long_window": 8, "confidence_scale_pct": 2.0}},
    "equity": {"moving_average": {"enabled": False}},
    "crypto": {"rsi_volatility": {"enabled": False}},
}

# Limiti di rischio permissivi (soglia di volatilità alta sugli ETF) per
# isolare il comportamento del motore di backtest da quello del filtro di
# volatilità del modulo 3, testato a parte nei suoi test dedicati.
RISK_CONFIG = {
    "version": 1,
    "enabled": True,
    "equity": {"enabled": True, "max_portfolio_pct": 60.0, "max_position_pct": 10.0, "stop_loss_pct": 8.0, "max_volatility_annualized": 0.40},
    "etf": {"enabled": True, "max_portfolio_pct": 70.0, "max_position_pct": 15.0, "stop_loss_pct": 6.0, "max_volatility_annualized": 3.0},
    "crypto": {"enabled": True, "max_portfolio_pct": 15.0, "max_position_pct": 5.0, "stop_loss_pct": 5.0, "max_volatility_annualized": 0.25},
    "portfolio": {"max_drawdown_pct": 20.0, "max_daily_loss_pct": 5.0},
}

WARMUP_BARS = 8  # == long_window della strategia ETF configurata sopra


def build_backtesting_config(**overrides) -> BacktestingConfig:
    data = {
        "commission_pct": 0.0,
        "slippage_pct": 0.0,
        "initial_equity": 100_000.0,
        "eligibility": {
            "min_trades": 1, "min_sharpe_ratio": -10.0, "max_drawdown_pct": 100.0, "min_win_rate_pct": 0.0,
        },
    }
    data.update(overrides)
    return BacktestingConfig(**data)


def build_engine(bt_config: BacktestingConfig | None = None, volatility_window: int = 5) -> BacktestEngine:
    strategy_engine = StrategyEngine(config=STRATEGY_CONFIG)
    risk_manager = RiskManager(config=RiskLimitsConfig(**RISK_CONFIG), volatility_window=volatility_window)
    return BacktestEngine(
        bt_config or build_backtesting_config(),
        strategy_engine,
        risk_manager,
        warmup_bars=WARMUP_BARS,
    )


def make_price_bars(prices: list[float]) -> pd.DataFrame:
    timestamps = pd.date_range("2024-01-01", periods=len(prices), freq="D", tz="UTC")
    return pd.DataFrame({"timestamp": timestamps, "close": prices})


# Scenario 1: entra il giorno 9 (cross SMA3>SMA8 immediato), crolla subito
# dopo => uscita per stop-loss.
STOP_LOSS_PRICES = [100.0] * WARMUP_BARS + [102.0, 105.0, 112.0, 50.0]

# Scenario 2: entra il giorno 9, sale, poi scende gradualmente fino a far
# scattare il segnale SELL (SMA3<SMA8) senza mai toccare lo stop-loss.
SIGNAL_SELL_PRICES = [100.0] * WARMUP_BARS + [102.0, 105.0, 110.0, 116.0, 123.0, 128.0, 124.0, 120.0, 116.0, 112.0, 108.0]

# Scenario 3: entra il giorno 9, i dati finiscono mentre è ancora in
# posizione (né stop né segnale SELL) => chiusura forzata a fine periodo.
END_OF_PERIOD_PRICES = [100.0] * WARMUP_BARS + [102.0, 104.0, 106.0]
