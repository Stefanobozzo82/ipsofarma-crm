"""Test del ciclo autonomo (modulo 8): resilienza per simbolo e stato reale del conto.

Nessuna rete: `EquityYFinanceSource`/`CryptoCCXTSource` sono sostituite da
`FakeDataSource` (vedi conftest), i dati vengono seminati direttamente nel
repository in memoria.
"""

from __future__ import annotations

import pytest

from tests.execution.conftest import build_execution_config, make_repository
from tests.orchestration.conftest import FakeDataSource, make_data_repo, seed_daily_bars
from tests.portfolio.conftest import build_portfolio_config
from tests.risk_management.conftest import build_config
from tests.strategy_engine.conftest import monotonic_rise
from trading_system.common.enums import AssetClass
from trading_system.execution import ExecutionManager
from trading_system.orchestration import cycle as cycle_module
from trading_system.orchestration.cycle import run_cycle
from trading_system.portfolio import PortfolioAllocator
from trading_system.risk_management import RiskManager
from trading_system.strategy_engine import StrategyEngine

_WATCHLIST = {
    "equity": [],
    "etf": [{"symbol": "SPY", "name": "SPDR S&P 500 ETF", "currency": "USD"}],
    "crypto": [],
}


def _patch_no_network(monkeypatch: pytest.MonkeyPatch, watchlist: dict = None) -> None:
    monkeypatch.setattr(cycle_module, "EquityYFinanceSource", FakeDataSource)
    monkeypatch.setattr(cycle_module, "CryptoCCXTSource", FakeDataSource)
    monkeypatch.setattr(cycle_module, "load_watchlist", lambda: watchlist or _WATCHLIST)


def _build_stack(data_repo, execution_repo, initial_cash: float = 100_000.0):
    risk_limits = build_config()
    risk_manager = RiskManager(config=risk_limits)
    portfolio_allocator = PortfolioAllocator(build_portfolio_config())
    execution_config = build_execution_config(paper={"initial_cash": initial_cash, "commission_pct": 0.0})

    def price_provider(symbol, asset_class):
        bars = data_repo.get_bars(symbol, asset_class, cycle_module.Timeframe.DAY_1)
        return float(bars[-1].close)

    execution_manager = ExecutionManager(execution_config, execution_repo, price_provider)
    strategy_engine = StrategyEngine()
    return risk_manager, portfolio_allocator, execution_manager, strategy_engine


def test_run_cycle_uses_real_persisted_account_state_not_a_fixed_example(monkeypatch: pytest.MonkeyPatch):
    # A differenza degli script demo (equity fissa a 100_000, nessuna
    # posizione), il ciclo autonomo deve leggere lo stato reale del conto
    # paper persistito: qui lo seminiamo con una cassa diversa dal default
    # e verifichiamo che il report finale rifletta quel valore, non un
    # valore fisso hardcoded.
    _patch_no_network(monkeypatch)
    data_repo = make_data_repo()
    execution_repo = make_repository()
    seed_daily_bars(data_repo, "SPY", AssetClass.ETF, monotonic_rise(periods=60, pct=0.001))

    custom_cash = 42_000.0
    risk_manager, allocator, execution_manager, strategy_engine = _build_stack(
        data_repo, execution_repo, initial_cash=custom_cash,
    )

    report = run_cycle(data_repo, execution_manager, risk_manager, allocator, strategy_engine)

    # L'equity di partenza del ciclo era 42_000 (nessuna posizione aperta):
    # se fosse stato usato il valore fisso di esempio (100_000) delle demo,
    # il sizing dell'ordine BUY (basato su account_equity) sarebbe stato
    # diverso, e la cassa residua non sarebbe scesa sotto i 42_000 di
    # partenza. Nessuna commissione in questo test: l'equity totale (cassa +
    # valore della posizione aperta) resta conservata.
    assert report.cash_after < custom_cash
    assert report.total_equity_after == pytest.approx(custom_cash)
    assert "SPY" not in report.symbols_skipped
    assert report.symbols_processed == 1


def test_run_cycle_skips_a_symbol_whose_data_source_fails_without_aborting(monkeypatch: pytest.MonkeyPatch):
    watchlist = {
        "equity": [],
        "etf": [
            {"symbol": "SPY", "name": "SPDR S&P 500 ETF", "currency": "USD"},
            {"symbol": "BROKEN", "name": "Simbolo che fallisce", "currency": "USD"},
        ],
        "crypto": [],
    }
    _patch_no_network(monkeypatch, watchlist)
    monkeypatch.setattr(FakeDataSource, "failing_symbols", {"BROKEN"})

    data_repo = make_data_repo()
    execution_repo = make_repository()
    # SPY ha dati storicizzati (da un ciclo precedente); BROKEN no (e la sua
    # fonte dati fallisce anche nel tentativo di aggiornamento).
    seed_daily_bars(data_repo, "SPY", AssetClass.ETF, monotonic_rise(periods=60, pct=0.001))

    risk_manager, allocator, execution_manager, strategy_engine = _build_stack(data_repo, execution_repo)

    report = run_cycle(data_repo, execution_manager, risk_manager, allocator, strategy_engine)

    assert "BROKEN" in report.symbols_skipped
    assert "SPY" not in report.symbols_skipped
    assert report.symbols_processed == 1


def test_run_cycle_skips_a_symbol_with_no_historical_data_at_all(monkeypatch: pytest.MonkeyPatch):
    watchlist = {"equity": [], "etf": [{"symbol": "NODATA", "name": "x", "currency": "USD"}], "crypto": []}
    _patch_no_network(monkeypatch, watchlist)

    data_repo = make_data_repo()
    execution_repo = make_repository()
    risk_manager, allocator, execution_manager, strategy_engine = _build_stack(data_repo, execution_repo)

    report = run_cycle(data_repo, execution_manager, risk_manager, allocator, strategy_engine)

    assert report.symbols_skipped == ["NODATA"]
    assert report.symbols_processed == 0
    # Nessuna eccezione propagata: il ciclo produce comunque un report.
    assert report.finished_at >= report.started_at


def test_run_cycle_never_raises_on_an_unexpected_per_symbol_error(monkeypatch: pytest.MonkeyPatch):
    _patch_no_network(monkeypatch)
    data_repo = make_data_repo()
    execution_repo = make_repository()
    seed_daily_bars(data_repo, "SPY", AssetClass.ETF, monotonic_rise(periods=60, pct=0.001))
    risk_manager, allocator, execution_manager, strategy_engine = _build_stack(data_repo, execution_repo)

    def _boom(*args, **kwargs):
        raise RuntimeError("errore imprevisto dello strategy engine (test)")

    monkeypatch.setattr(strategy_engine, "generate_signals", _boom)

    report = run_cycle(data_repo, execution_manager, risk_manager, allocator, strategy_engine)

    assert "SPY" in report.symbols_skipped
    assert any("SPY" in e for e in report.errors)


def test_run_cycle_only_executes_in_paper_mode(monkeypatch: pytest.MonkeyPatch):
    # config/execution.yaml di test è mode='paper': ogni ordine prodotto dal
    # ciclo deve restare sul broker paper, mai su un broker live.
    _patch_no_network(monkeypatch)
    data_repo = make_data_repo()
    execution_repo = make_repository()
    seed_daily_bars(data_repo, "SPY", AssetClass.ETF, monotonic_rise(periods=60, pct=0.001))
    risk_manager, allocator, execution_manager, strategy_engine = _build_stack(data_repo, execution_repo)

    run_cycle(data_repo, execution_manager, risk_manager, allocator, strategy_engine)

    orders = execution_repo.list_orders()
    assert all(o.mode == "paper" for o in orders)
    if any(o.status == "filled" for o in orders):
        assert all(o.broker == "paper" for o in orders if o.status == "filled")
