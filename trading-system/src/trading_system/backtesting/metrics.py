"""Metriche di performance calcolate su una curva di equity e/o una lista di trade.

Funzioni pure, senza stato, testate indipendentemente dal motore di
backtest che le richiama — stesso principio già usato per gli indicatori
tecnici dello strategy engine (modulo 2).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from trading_system.common.models import BacktestTrade


def total_return_pct(equity: pd.Series) -> float:
    """Rendimento totale, in percentuale, dall'inizio alla fine della curva di equity."""
    if len(equity) < 2 or equity.iloc[0] == 0:
        return 0.0
    return float((equity.iloc[-1] / equity.iloc[0] - 1.0) * 100.0)


def cagr_pct(equity: pd.Series, periods_per_year: int = 252) -> float:
    """Rendimento annualizzato composto (CAGR), in percentuale.

    Se la curva copre un periodo troppo breve per un'annualizzazione
    stabile (< 1 giorno di calendario), ritorna il rendimento totale non
    annualizzato invece di un valore instabile/esploso.
    """
    if len(equity) < 2 or equity.iloc[0] <= 0:
        return 0.0

    duration_days = (equity.index[-1] - equity.index[0]).days
    if duration_days < 1:
        return total_return_pct(equity)

    duration_years = duration_days / 365.25
    ratio = equity.iloc[-1] / equity.iloc[0]
    if ratio <= 0:
        return -100.0
    return float((ratio ** (1.0 / duration_years) - 1.0) * 100.0)


def max_drawdown_pct(equity: pd.Series) -> float:
    """Massimo drawdown (dal picco al minimo successivo), in percentuale, come valore positivo."""
    if equity.empty:
        return 0.0
    running_max = equity.cummax()
    drawdown = (equity - running_max) / running_max.replace(0.0, np.nan)
    worst = drawdown.min()
    return float(abs(worst) * 100.0) if pd.notna(worst) else 0.0


def sharpe_ratio(equity: pd.Series, periods_per_year: int = 252, risk_free_rate_pct: float = 0.0) -> float:
    """Sharpe ratio annualizzato sui rendimenti periodali della curva di equity.

    Ritorna 0.0 se non ci sono abbastanza punti o se la deviazione standard
    dei rendimenti è nulla (nessuna variazione, es. nessun trade eseguito).
    """
    if len(equity) < 2:
        return 0.0

    returns = equity.pct_change().dropna()
    if returns.empty or returns.std() == 0:
        return 0.0

    periodic_risk_free = risk_free_rate_pct / 100.0 / periods_per_year
    excess_returns = returns - periodic_risk_free
    return float(excess_returns.mean() / returns.std() * np.sqrt(periods_per_year))


def win_rate_pct(trades: list[BacktestTrade]) -> float:
    """Percentuale di trade chiusi in guadagno (pnl > 0). 0.0 se non ci sono trade."""
    if not trades:
        return 0.0
    winners = sum(1 for t in trades if t.pnl > 0)
    return float(winners / len(trades) * 100.0)
