"""Test del BacktestEngine (modulo critico: orchestra strategy engine + risk manager reali)."""

from __future__ import annotations

import pytest

from tests.backtesting.conftest import (
    END_OF_PERIOD_PRICES,
    SIGNAL_SELL_PRICES,
    STOP_LOSS_PRICES,
    WARMUP_BARS,
    build_backtesting_config,
    build_engine,
    make_price_bars,
)
from trading_system.common.enums import AssetClass, OrderSide


def test_stop_loss_exit_closes_position_at_stop_price():
    engine = build_engine()
    bars = make_price_bars(STOP_LOSS_PRICES)

    run = engine.run("SPY", AssetClass.ETF, bars)

    assert run.result.num_trades == 1
    trade = run.result.trades[0]
    assert trade.side == OrderSide.BUY
    assert trade.exit_reason == "stop_loss"
    assert trade.entry_price == pytest.approx(102.0)
    assert trade.exit_price == pytest.approx(102.0 * 0.94)  # stop_loss_pct=6.0 sull'ETF
    assert trade.pnl < 0  # lo stop-loss chiude sempre in perdita, per costruzione


def test_signal_sell_exit_closes_position_on_crossover():
    engine = build_engine()
    bars = make_price_bars(SIGNAL_SELL_PRICES)

    run = engine.run("SPY", AssetClass.ETF, bars)

    assert run.result.num_trades == 1
    trade = run.result.trades[0]
    assert trade.exit_reason == "segnale_sell"
    assert trade.entry_price == pytest.approx(102.0)
    assert trade.exit_price == pytest.approx(112.0)
    assert trade.pnl > 0


def test_open_position_force_closed_at_end_of_period():
    engine = build_engine()
    bars = make_price_bars(END_OF_PERIOD_PRICES)

    run = engine.run("SPY", AssetClass.ETF, bars)

    assert run.result.num_trades == 1
    trade = run.result.trades[0]
    assert trade.exit_reason == "fine_periodo"
    assert trade.exit_price == pytest.approx(END_OF_PERIOD_PRICES[-1])


def test_equity_curve_length_matches_simulated_days():
    engine = build_engine()
    bars = make_price_bars(SIGNAL_SELL_PRICES)

    run = engine.run("SPY", AssetClass.ETF, bars)

    assert len(run.equity_curve) == len(SIGNAL_SELL_PRICES) - WARMUP_BARS
    assert run.result.final_equity == pytest.approx(run.equity_curve.iloc[-1])


def test_result_carries_strategy_name_and_asset_class():
    engine = build_engine()
    bars = make_price_bars(SIGNAL_SELL_PRICES)

    run = engine.run("SPY", AssetClass.ETF, bars)

    assert run.result.symbol == "SPY"
    assert run.result.asset_class == AssetClass.ETF
    assert run.result.strategy_name == "etf_moving_average_3_8"


def test_insufficient_data_raises():
    engine = build_engine()
    bars = make_price_bars([100.0] * (WARMUP_BARS - 1))

    with pytest.raises(ValueError):
        engine.run("SPY", AssetClass.ETF, bars)


def test_commission_and_slippage_reduce_pnl_versus_zero_cost_run():
    bars = make_price_bars(SIGNAL_SELL_PRICES)

    free_engine = build_engine(build_backtesting_config(commission_pct=0.0, slippage_pct=0.0))
    costly_engine = build_engine(build_backtesting_config(commission_pct=0.5, slippage_pct=0.5))

    free_trade = free_engine.run("SPY", AssetClass.ETF, bars).result.trades[0]
    costly_trade = costly_engine.run("SPY", AssetClass.ETF, bars).result.trades[0]

    assert costly_trade.pnl < free_trade.pnl


def test_no_lookahead_bias_earlier_equity_unaffected_by_future_bars():
    # Proprietà cruciale di un motore di backtest: il risultato fino al
    # giorno N non deve cambiare aggiungendo barre future oltre N.
    bars = make_price_bars(SIGNAL_SELL_PRICES)
    cutoff = WARMUP_BARS + 4

    full_run = build_engine().run("SPY", AssetClass.ETF, bars)
    partial_run = build_engine().run("SPY", AssetClass.ETF, bars.iloc[:cutoff].copy())

    common_length = len(partial_run.equity_curve)
    pd_testing_equal = full_run.equity_curve.iloc[:common_length].equals(partial_run.equity_curve)
    assert pd_testing_equal


def test_stop_loss_check_uses_low_column_when_available():
    # Se il DataFrame include 'low', il motore deve usarlo per il controllo
    # dello stop-loss (più prudente della sola chiusura).
    engine = build_engine()
    bars = make_price_bars(STOP_LOSS_PRICES)
    bars["low"] = bars["close"]  # nessuna differenza dal caso senza 'low', ma esercita il ramo di codice
    bars["high"] = bars["close"]
    bars["open"] = bars["close"]

    run = engine.run("SPY", AssetClass.ETF, bars)

    assert run.result.trades[0].exit_reason == "stop_loss"
