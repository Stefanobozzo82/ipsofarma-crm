"""Modulo 5 — Backtesting.

Verifica ogni strategia su dati storici prima che possa operare con denaro
reale: `BacktestEngine` esegue una simulazione walk-forward (nessun
look-ahead) usando **le stesse istanze** di `StrategyEngine` (modulo 2) e
`RiskManager` (modulo 3) che opererebbero dal vivo — non una
reimplementazione parallela — così che un esito positivo dica davvero
qualcosa sulla logica in produzione.

`metrics.py` calcola rendimento, drawdown, Sharpe ratio; `aggregate.py`
combina più backtest per asset class e sul totale portafoglio;
`eligibility.py` confronta un risultato con le soglie minime di
`config/backtesting.yaml` — per vincolo di prodotto, nessuna strategia può
passare all'execution live (modulo 6) senza un esito qui positivo.
"""

from trading_system.backtesting.aggregate import AggregateBacktestSummary, aggregate_equity_curves, aggregate_metrics
from trading_system.backtesting.config_loader import BacktestingConfig, EligibilityCriteria, load_backtesting_config
from trading_system.backtesting.eligibility import evaluate_eligibility
from trading_system.backtesting.engine import BacktestEngine, BacktestRun

__all__ = [
    "AggregateBacktestSummary",
    "aggregate_equity_curves",
    "aggregate_metrics",
    "BacktestingConfig",
    "EligibilityCriteria",
    "load_backtesting_config",
    "evaluate_eligibility",
    "BacktestEngine",
    "BacktestRun",
]
