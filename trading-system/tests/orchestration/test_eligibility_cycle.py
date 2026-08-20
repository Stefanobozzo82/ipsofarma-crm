"""Test del job di refresh dell'eleggibilità (modulo 8): resilienza per
simbolo e persistenza corretta via `EligibilityRepository`.

Nessuna rete: `EquityYFinanceSource`/`CryptoCCXTSource` sono sostituite da
`FakeDataSource` (vedi conftest), i dati vengono seminati direttamente nel
repository in memoria — stesso schema di test già usato per `test_cycle.py`.
"""

from __future__ import annotations

import pytest

from tests.backtesting.conftest import (
    STOP_LOSS_PRICES,
    WARMUP_BARS,
    build_backtesting_config,
    build_engine,
)
from tests.orchestration.conftest import FakeDataSource, make_data_repo, seed_daily_bars
from trading_system.backtesting.storage import EligibilityRepository, create_sqlite_engine as create_eligibility_engine
from trading_system.common.enums import AssetClass
from trading_system.orchestration import eligibility_cycle as eligibility_cycle_module
from trading_system.orchestration.eligibility_cycle import refresh_eligibility

_STRATEGY_NAME = "etf_moving_average_3_8"  # short_window=3, long_window=8 — vedi tests.backtesting.conftest.STRATEGY_CONFIG

_WATCHLIST = {"equity": [], "etf": [{"symbol": "SPY", "name": "SPDR S&P 500 ETF", "currency": "USD"}], "crypto": []}


def _patch_no_network(monkeypatch: pytest.MonkeyPatch, watchlist: dict = None) -> None:
    monkeypatch.setattr(eligibility_cycle_module, "EquityYFinanceSource", FakeDataSource)
    monkeypatch.setattr(eligibility_cycle_module, "CryptoCCXTSource", FakeDataSource)
    monkeypatch.setattr(eligibility_cycle_module, "load_watchlist", lambda: watchlist or _WATCHLIST)


def _make_eligibility_repo() -> EligibilityRepository:
    return EligibilityRepository(create_eligibility_engine("sqlite:///:memory:"))


def test_refresh_eligibility_persists_evaluation_for_a_symbol_with_enough_trades(monkeypatch: pytest.MonkeyPatch):
    _patch_no_network(monkeypatch)
    data_repo = make_data_repo()
    eligibility_repo = _make_eligibility_repo()
    seed_daily_bars(data_repo, "SPY", AssetClass.ETF, STOP_LOSS_PRICES)

    bt_config = build_backtesting_config(eligibility={
        "min_trades": 1, "min_sharpe_ratio": -10.0, "max_drawdown_pct": 100.0, "min_win_rate_pct": 0.0,
    })
    engine = build_engine(bt_config)

    report = refresh_eligibility(data_repo, eligibility_repo, engine, bt_config)

    assert "SPY" in report.symbols_evaluated
    assert "SPY" not in report.symbols_skipped

    eligibility = eligibility_repo.get_latest("SPY", _STRATEGY_NAME)
    assert eligibility is not None
    assert eligibility.symbol == "SPY"
    # Un solo trade (scenario stop-loss): con min_trades=1 il criterio sul
    # numero di trade è superato, l'esito dipende dalle altre soglie
    # (permissive in build_backtesting_config) — verifichiamo solo che sia
    # stato valutato e persistito, non un verdetto specifico.
    assert eligibility.reason


def test_refresh_eligibility_rejects_when_too_few_trades(monkeypatch: pytest.MonkeyPatch):
    _patch_no_network(monkeypatch)
    data_repo = make_data_repo()
    eligibility_repo = _make_eligibility_repo()
    seed_daily_bars(data_repo, "SPY", AssetClass.ETF, STOP_LOSS_PRICES)

    # config/backtesting.yaml reale richiede min_trades=10: lo scenario di
    # test ne produce uno solo, quindi l'eleggibilità deve essere rifiutata.
    bt_config = build_backtesting_config(eligibility={
        "min_trades": 10, "min_sharpe_ratio": -10.0, "max_drawdown_pct": 100.0, "min_win_rate_pct": 0.0,
    })
    engine = build_engine(bt_config)

    refresh_eligibility(data_repo, eligibility_repo, engine, bt_config)

    eligibility = eligibility_repo.get_latest("SPY", _STRATEGY_NAME)
    assert eligibility is not None
    assert eligibility.approved is False
    assert "trade" in eligibility.reason.lower()


def test_refresh_eligibility_skips_symbol_with_insufficient_data(monkeypatch: pytest.MonkeyPatch):
    _patch_no_network(monkeypatch)
    data_repo = make_data_repo()
    eligibility_repo = _make_eligibility_repo()
    # Nessuna barra seminata: meno del warmup richiesto dal motore di backtest.

    bt_config = build_backtesting_config()
    engine = build_engine(bt_config)

    report = refresh_eligibility(data_repo, eligibility_repo, engine, bt_config)

    assert "SPY" in report.symbols_skipped
    assert "SPY" not in report.symbols_evaluated
    assert eligibility_repo.get_latest("SPY", _STRATEGY_NAME) is None


def test_refresh_eligibility_skips_a_symbol_whose_data_source_fails_without_aborting(monkeypatch: pytest.MonkeyPatch):
    watchlist = {
        "equity": [], "crypto": [],
        "etf": [
            {"symbol": "SPY", "name": "x", "currency": "USD"},
            {"symbol": "BROKEN", "name": "y", "currency": "USD"},
        ],
    }
    _patch_no_network(monkeypatch, watchlist)
    monkeypatch.setattr(FakeDataSource, "failing_symbols", {"BROKEN"})

    data_repo = make_data_repo()
    eligibility_repo = _make_eligibility_repo()
    seed_daily_bars(data_repo, "SPY", AssetClass.ETF, STOP_LOSS_PRICES)

    bt_config = build_backtesting_config(eligibility={
        "min_trades": 1, "min_sharpe_ratio": -10.0, "max_drawdown_pct": 100.0, "min_win_rate_pct": 0.0,
    })
    engine = build_engine(bt_config)

    report = refresh_eligibility(data_repo, eligibility_repo, engine, bt_config)

    assert "BROKEN" in report.symbols_skipped
    assert "SPY" in report.symbols_evaluated


def test_refresh_eligibility_never_raises_on_an_unexpected_engine_error(monkeypatch: pytest.MonkeyPatch):
    _patch_no_network(monkeypatch)
    data_repo = make_data_repo()
    eligibility_repo = _make_eligibility_repo()
    seed_daily_bars(data_repo, "SPY", AssetClass.ETF, STOP_LOSS_PRICES)

    bt_config = build_backtesting_config()
    engine = build_engine(bt_config)

    def _boom(*args, **kwargs):
        raise RuntimeError("errore imprevisto del motore di backtest (test)")

    monkeypatch.setattr(engine, "run", _boom)

    report = refresh_eligibility(data_repo, eligibility_repo, engine, bt_config)

    assert "SPY" in report.symbols_skipped
    assert any("SPY" in e for e in report.errors)


def test_get_latest_returns_the_most_recent_evaluation():
    eligibility_repo = _make_eligibility_repo()
    from datetime import datetime, timedelta, timezone
    from trading_system.common.models import BacktestEligibility

    older = BacktestEligibility(
        symbol="SPY", asset_class=AssetClass.ETF, strategy_name=_STRATEGY_NAME,
        approved=False, reason="vecchia valutazione",
        evaluated_at=datetime.now(timezone.utc) - timedelta(days=7),
    )
    newer = BacktestEligibility(
        symbol="SPY", asset_class=AssetClass.ETF, strategy_name=_STRATEGY_NAME,
        approved=True, reason="valutazione più recente",
        evaluated_at=datetime.now(timezone.utc),
    )
    eligibility_repo.save(older)
    eligibility_repo.save(newer)

    latest = eligibility_repo.get_latest("SPY", _STRATEGY_NAME)

    assert latest is not None
    assert latest.approved is True
    assert latest.reason == "valutazione più recente"


def test_get_latest_returns_none_when_never_evaluated():
    eligibility_repo = _make_eligibility_repo()

    assert eligibility_repo.get_latest("SPY", _STRATEGY_NAME) is None
