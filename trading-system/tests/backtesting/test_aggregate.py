"""Test dell'aggregazione di più backtest (per asset class e sul totale)."""

from __future__ import annotations

import pandas as pd
import pytest

from tests.backtesting.conftest import (
    SIGNAL_SELL_PRICES,
    STOP_LOSS_PRICES,
    build_engine,
    make_price_bars,
)
from trading_system.backtesting.aggregate import aggregate_equity_curves, aggregate_metrics
from trading_system.common.enums import AssetClass


def _run(symbol: str, prices: list[float], start: str = "2024-01-01"):
    timestamps = pd.date_range(start, periods=len(prices), freq="D", tz="UTC")
    bars = pd.DataFrame({"timestamp": timestamps, "close": prices})
    return build_engine().run(symbol, AssetClass.ETF, bars)


def test_aggregate_equity_curves_sums_across_runs():
    run_a = _run("SPY", SIGNAL_SELL_PRICES)  # curva più lunga
    run_b = _run("IWM", STOP_LOSS_PRICES)  # curva più corta, stesso inizio

    combined = aggregate_equity_curves([run_a, run_b])

    # Sull'ultima data comune a entrambe le curve, il totale deve essere la somma esatta.
    last_common_date = run_b.equity_curve.index[-1]
    expected = run_a.equity_curve.loc[last_common_date] + run_b.equity_curve.loc[last_common_date]
    assert combined.loc[last_common_date] == pytest.approx(expected)

    # Oltre la fine della curva più corta, il suo contributo resta congelato
    # all'ultimo valore raggiunto (il capitale non "torna" al valore
    # iniziale solo perché quel backtest è terminato prima).
    later_date = run_a.equity_curve.index[-1]
    assert combined.loc[later_date] == pytest.approx(
        run_a.equity_curve.loc[later_date] + run_b.equity_curve.iloc[-1]
    )


def test_aggregate_equity_curves_uses_initial_equity_before_a_run_starts():
    # run_b inizia più tardi in calendario di run_a: prima che la sua
    # simulazione cominci, il suo contributo deve essere il capitale
    # iniziale (capitale "parcheggiato", non ancora investito), non zero.
    run_a = _run("SPY", SIGNAL_SELL_PRICES, start="2024-01-01")
    run_b = _run("IWM", STOP_LOSS_PRICES, start="2024-06-01")

    combined = aggregate_equity_curves([run_a, run_b])

    early_date = run_a.equity_curve.index[0]
    assert combined.loc[early_date] == pytest.approx(
        run_a.equity_curve.loc[early_date] + run_b.result.initial_equity
    )


def test_aggregate_equity_curves_empty_input():
    result = aggregate_equity_curves([])
    assert result.empty


def test_aggregate_metrics_for_single_asset_class():
    run_a = _run("SPY", SIGNAL_SELL_PRICES)
    run_b = _run("IWM", STOP_LOSS_PRICES)

    summary = aggregate_metrics([run_a, run_b], asset_class=AssetClass.ETF)

    assert summary.asset_class == AssetClass.ETF
    assert summary.num_symbols == 2
    assert summary.num_trades == run_a.result.num_trades + run_b.result.num_trades
    assert summary.initial_equity == pytest.approx(run_a.result.initial_equity + run_b.result.initial_equity)


def test_aggregate_metrics_total_across_all_asset_classes():
    run_a = _run("SPY", SIGNAL_SELL_PRICES)
    run_b = _run("IWM", STOP_LOSS_PRICES)

    total_summary = aggregate_metrics([run_a, run_b], asset_class=None)

    assert total_summary.asset_class is None
    assert total_summary.num_symbols == 2


def test_aggregate_metrics_raises_when_no_matching_runs():
    run_a = _run("SPY", SIGNAL_SELL_PRICES)

    with pytest.raises(ValueError):
        aggregate_metrics([run_a], asset_class=AssetClass.CRYPTO)
