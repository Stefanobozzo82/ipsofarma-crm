"""Modulo 2 — Strategy engine.

Regole configurabili per asset class (`config/strategies.yaml`): media
mobile per ETF, RSI + filtro di volatilità per crypto, media mobile + filtro
fondamentale per azioni. Ogni strategia produce
`trading_system.common.models.Signal` con score di confidenza in [0, 1] e
motivazione testuale tracciabile.

Non decide dimensionamento delle posizioni né esecuzione: quello è compito
dei moduli 3 (risk management) e 4 (portfolio allocator), non ancora
implementati.
"""

from trading_system.strategy_engine.base import Strategy
from trading_system.strategy_engine.crypto_strategies import RSIVolatilityStrategy
from trading_system.strategy_engine.engine import StrategyEngine
from trading_system.strategy_engine.equity_strategies import (
    EquityMovingAverageFundamentalsStrategy,
)
from trading_system.strategy_engine.etf_strategies import MovingAverageCrossoverStrategy

__all__ = [
    "Strategy",
    "StrategyEngine",
    "MovingAverageCrossoverStrategy",
    "RSIVolatilityStrategy",
    "EquityMovingAverageFundamentalsStrategy",
]
