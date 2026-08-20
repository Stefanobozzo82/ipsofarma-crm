"""Aggregazione di più backtest: per asset class e sull'intero portafoglio.

**Semplificazione dichiarata**: ogni `BacktestRun` gira con il proprio
capitale iniziale indipendente (`config/backtesting.yaml: initial_equity`),
come se ogni simbolo operasse in parallelo con la propria dotazione — non
attraverso l'arbitraggio di budget condiviso del modulo 4 (portfolio
allocator), che è una logica di gestione del capitale *live*, non di
backtest storico multi-simbolo. Le curve di equity vengono sommate giorno
per giorno per ottenere una curva di portafoglio aggregata; prima
dell'inizio della finestra di simulazione di un simbolo, il suo contributo
resta al valore iniziale (capitale "parcheggiato", non ancora investito).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
from pydantic import BaseModel

from trading_system.backtesting import metrics
from trading_system.backtesting.engine import BacktestRun
from trading_system.common.enums import AssetClass
from trading_system.common.models import BacktestTrade


class AggregateBacktestSummary(BaseModel):
    """Metriche aggregate su più backtest: per asset class (`asset_class` impostato) o sul totale (`None`)."""

    asset_class: AssetClass | None
    num_symbols: int
    num_trades: int
    initial_equity: float
    final_equity: float
    total_return_pct: float
    cagr_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    win_rate_pct: float
    generated_at: datetime


def aggregate_equity_curves(runs: list[BacktestRun]) -> pd.Series:
    """Somma le curve di equity di più backtest su un asse temporale comune."""
    if not runs:
        return pd.Series(dtype=float)

    all_dates = sorted(set().union(*(set(run.equity_curve.index) for run in runs)))
    total = pd.Series(0.0, index=pd.DatetimeIndex(all_dates))

    for run in runs:
        aligned = run.equity_curve.reindex(all_dates)
        aligned = aligned.ffill()
        # Prima dell'inizio della sua finestra di simulazione, il capitale
        # di questo simbolo resta al valore iniziale (non ancora investito).
        aligned = aligned.fillna(run.result.initial_equity)
        total = total.add(aligned, fill_value=0.0)

    total.name = "equity_aggregate"
    return total


def aggregate_metrics(
    runs: list[BacktestRun],
    asset_class: AssetClass | None = None,
    periods_per_year: int = 252,
) -> AggregateBacktestSummary:
    """Calcola le metriche aggregate su `runs`, filtrando per `asset_class` se indicato.

    `asset_class=None` aggrega su tutti i run passati (il "totale portafoglio").
    """
    filtered = runs if asset_class is None else [r for r in runs if r.result.asset_class == asset_class]
    if not filtered:
        raise ValueError("Nessun risultato di backtest da aggregare per il filtro richiesto.")

    equity_curve = aggregate_equity_curves(filtered)
    all_trades: list[BacktestTrade] = [t for r in filtered for t in r.result.trades]

    return AggregateBacktestSummary(
        asset_class=asset_class,
        num_symbols=len(filtered),
        num_trades=len(all_trades),
        initial_equity=float(equity_curve.iloc[0]) if not equity_curve.empty else 0.0,
        final_equity=float(equity_curve.iloc[-1]) if not equity_curve.empty else 0.0,
        total_return_pct=metrics.total_return_pct(equity_curve),
        cagr_pct=metrics.cagr_pct(equity_curve, periods_per_year=periods_per_year),
        max_drawdown_pct=metrics.max_drawdown_pct(equity_curve),
        sharpe_ratio=metrics.sharpe_ratio(equity_curve, periods_per_year=periods_per_year),
        win_rate_pct=metrics.win_rate_pct(all_trades),
        generated_at=datetime.now(timezone.utc),
    )
