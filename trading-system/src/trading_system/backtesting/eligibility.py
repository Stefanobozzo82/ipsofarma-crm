"""Valutazione dell'eleggibilità di un `BacktestResult` a operare con denaro reale.

Per vincolo di prodotto ("Nessuna operazione reale deve partire senza
backtesting positivo"), il modulo 6 (execution, non ancora implementato)
deve consultare `evaluate_eligibility` prima di attivare il trading live
per una strategia/simbolo, e rifiutarsi se `approved` è `False`.
"""

from __future__ import annotations

from datetime import datetime, timezone

from trading_system.backtesting.config_loader import EligibilityCriteria
from trading_system.common.logging_config import get_logger
from trading_system.common.models import BacktestEligibility, BacktestResult

logger = get_logger(__name__)


def evaluate_eligibility(result: BacktestResult, criteria: EligibilityCriteria) -> BacktestEligibility:
    """Confronta un `BacktestResult` con le soglie minime di `criteria`.

    Tutte le soglie violate vengono elencate nella motivazione — non solo la
    prima trovata — per rendere il rifiuto pienamente spiegabile.
    """
    failures: list[str] = []

    if result.num_trades < criteria.min_trades:
        failures.append(
            f"numero di trade insufficiente ({result.num_trades} < {criteria.min_trades}): "
            f"risultato non statisticamente significativo"
        )
    if result.sharpe_ratio < criteria.min_sharpe_ratio:
        failures.append(
            f"Sharpe ratio {result.sharpe_ratio:.2f} sotto la soglia minima {criteria.min_sharpe_ratio:.2f}"
        )
    if result.max_drawdown_pct > criteria.max_drawdown_pct:
        failures.append(
            f"drawdown massimo {result.max_drawdown_pct:.1f}% oltre la soglia {criteria.max_drawdown_pct:.1f}%"
        )
    if result.win_rate_pct < criteria.min_win_rate_pct:
        failures.append(
            f"win rate {result.win_rate_pct:.1f}% sotto la soglia minima {criteria.min_win_rate_pct:.1f}%"
        )

    approved = not failures
    reason = (
        "Backtest positivo: tutti i criteri di eleggibilità superati."
        if approved
        else "Backtest non idoneo per il trading live: " + "; ".join(failures)
    )

    logger.info(
        "Eleggibilità backtest | symbol=%s asset_class=%s approved=%s",
        result.symbol, result.asset_class.value, approved,
    )
    return BacktestEligibility(
        symbol=result.symbol,
        asset_class=result.asset_class,
        strategy_name=result.strategy_name,
        approved=approved,
        reason=reason,
        evaluated_at=datetime.now(timezone.utc),
    )
