"""Test di `EligibilityRepository` (modulo 5): persistenza/lettura dell'eleggibilità al live."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from trading_system.backtesting.storage import EligibilityRepository, create_sqlite_engine
from trading_system.common.enums import AssetClass
from trading_system.common.models import BacktestEligibility


def _repo() -> EligibilityRepository:
    return EligibilityRepository(create_sqlite_engine("sqlite:///:memory:"))


def _eligibility(**overrides) -> BacktestEligibility:
    data = dict(
        symbol="SPY", asset_class=AssetClass.ETF, strategy_name="etf_moving_average_20_50",
        approved=True, reason="Backtest positivo: tutti i criteri di eleggibilità superati.",
        evaluated_at=datetime.now(timezone.utc),
    )
    data.update(overrides)
    return BacktestEligibility(**data)


def test_get_latest_returns_none_when_nothing_saved():
    repo = _repo()

    assert repo.get_latest("SPY", "etf_moving_average_20_50") is None


def test_save_then_get_latest_round_trips_all_fields():
    repo = _repo()
    saved = _eligibility()

    repo.save(saved)
    loaded = repo.get_latest(saved.symbol, saved.strategy_name)

    assert loaded is not None
    assert loaded.symbol == saved.symbol
    assert loaded.asset_class == saved.asset_class
    assert loaded.strategy_name == saved.strategy_name
    assert loaded.approved == saved.approved
    assert loaded.reason == saved.reason
    assert loaded.evaluated_at == saved.evaluated_at


def test_get_latest_picks_the_most_recent_of_several_evaluations():
    repo = _repo()
    now = datetime.now(timezone.utc)
    repo.save(_eligibility(approved=False, reason="vecchia", evaluated_at=now - timedelta(days=14)))
    repo.save(_eligibility(approved=True, reason="recente", evaluated_at=now))
    repo.save(_eligibility(approved=False, reason="intermedia", evaluated_at=now - timedelta(days=7)))

    latest = repo.get_latest("SPY", "etf_moving_average_20_50")

    assert latest.reason == "recente"
    assert latest.approved is True


def test_get_latest_is_scoped_to_symbol_and_strategy_name():
    repo = _repo()
    repo.save(_eligibility(symbol="SPY", strategy_name="etf_moving_average_20_50", reason="spy"))
    repo.save(_eligibility(symbol="AAPL", strategy_name="equity_ma_fundamentals_20_50", reason="aapl"))

    assert repo.get_latest("SPY", "etf_moving_average_20_50").reason == "spy"
    assert repo.get_latest("AAPL", "equity_ma_fundamentals_20_50").reason == "aapl"
    # Stesso symbol, strategia diversa: nessuna riga corrispondente.
    assert repo.get_latest("SPY", "altra_strategia") is None


def test_returned_evaluated_at_is_timezone_aware():
    # Coerenza con execution.gate.LiveTradingGate, che confronta evaluated_at
    # con datetime.now(timezone.utc): un valore naive romperebbe quel confronto.
    repo = _repo()
    repo.save(_eligibility())

    loaded = repo.get_latest("SPY", "etf_moving_average_20_50")

    assert loaded.evaluated_at.tzinfo is not None
