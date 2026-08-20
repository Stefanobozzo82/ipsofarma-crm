"""Test di ExecutionRepository (storico ordini + stato del conto paper)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from tests.execution.conftest import make_repository
from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide, OrderStatus
from trading_system.common.models import Order


def _order(symbol="SPY", side=OrderSide.BUY, status=OrderStatus.FILLED, mode=ExecutionMode.PAPER, strategy_name="s1", created_at=None) -> Order:
    now = created_at or datetime.now(timezone.utc)
    return Order(
        symbol=symbol, asset_class=AssetClass.ETF, side=side, quantity=1.0, mode=mode, broker="paper",
        strategy_name=strategy_name, status=status, reason="test", filled_price=100.0,
        filled_at=now if status == OrderStatus.FILLED else None, created_at=now,
    )


class TestPaperAccount:
    def test_ensure_paper_account_creates_with_initial_cash(self):
        repo = make_repository()
        cash = repo.ensure_paper_account(50_000.0)
        assert cash == 50_000.0
        assert repo.get_cash() == 50_000.0

    def test_ensure_paper_account_is_idempotent(self):
        repo = make_repository()
        repo.ensure_paper_account(50_000.0)
        repo.set_cash(40_000.0)
        cash = repo.ensure_paper_account(999_999.0)  # non deve sovrascrivere un conto esistente
        assert cash == 40_000.0

    def test_get_cash_without_account_raises(self):
        repo = make_repository()
        with pytest.raises(RuntimeError):
            repo.get_cash()

    def test_set_cash_updates_value(self):
        repo = make_repository()
        repo.ensure_paper_account(10_000.0)
        repo.set_cash(12_345.0)
        assert repo.get_cash() == 12_345.0


class TestPaperPositions:
    def test_add_to_position_creates_new(self):
        repo = make_repository()
        repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)

        position = repo.get_position("SPY")
        assert position.quantity == 10.0
        assert position.average_entry_price == 100.0

    def test_add_to_position_updates_weighted_average(self):
        repo = make_repository()
        repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        repo.add_to_position("SPY", AssetClass.ETF, 10.0, 120.0)

        position = repo.get_position("SPY")
        assert position.quantity == 20.0
        assert position.average_entry_price == pytest.approx(110.0)

    def test_reduce_position_partial(self):
        repo = make_repository()
        repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        repo.reduce_position("SPY", 4.0)

        position = repo.get_position("SPY")
        assert position.quantity == pytest.approx(6.0)

    def test_reduce_position_to_zero_removes_it(self):
        repo = make_repository()
        repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        repo.reduce_position("SPY", 10.0)

        assert repo.get_position("SPY") is None

    def test_reduce_position_without_existing_is_a_noop(self):
        repo = make_repository()
        repo.reduce_position("SPY", 5.0)  # non deve sollevare eccezioni
        assert repo.get_position("SPY") is None

    def test_get_positions_returns_all(self):
        repo = make_repository()
        repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        repo.add_to_position("BTC/USDT", AssetClass.CRYPTO, 1.0, 50_000.0)

        positions = repo.get_positions()
        assert {p.symbol for p in positions} == {"SPY", "BTC/USDT"}


class TestOrderHistory:
    def test_record_and_list_orders(self):
        repo = make_repository()
        repo.record_order(_order(symbol="SPY"))
        repo.record_order(_order(symbol="AAPL"))

        assert len(repo.list_orders()) == 2
        assert len(repo.list_orders(symbol="SPY")) == 1

    def test_list_orders_filters_by_mode(self):
        repo = make_repository()
        repo.record_order(_order(mode=ExecutionMode.PAPER))
        repo.record_order(_order(mode=ExecutionMode.LIVE))

        assert len(repo.list_orders(mode=ExecutionMode.PAPER)) == 1
        assert len(repo.list_orders(mode=ExecutionMode.LIVE)) == 1


class TestValidationStats:
    def test_no_orders_returns_zero_and_none(self):
        repo = make_repository()
        count, first_at = repo.get_validation_stats("SPY", "test_strategy")
        assert count == 0
        assert first_at is None

    def test_counts_only_filled_paper_orders_for_symbol_and_strategy(self):
        repo = make_repository()
        repo.record_order(_order(symbol="SPY", strategy_name="s1", status=OrderStatus.FILLED, mode=ExecutionMode.PAPER))
        repo.record_order(_order(symbol="SPY", strategy_name="s1", status=OrderStatus.REJECTED, mode=ExecutionMode.PAPER))
        repo.record_order(_order(symbol="SPY", strategy_name="s2", status=OrderStatus.FILLED, mode=ExecutionMode.PAPER))
        repo.record_order(_order(symbol="SPY", strategy_name="s1", status=OrderStatus.FILLED, mode=ExecutionMode.LIVE))
        repo.record_order(_order(symbol="AAPL", strategy_name="s1", status=OrderStatus.FILLED, mode=ExecutionMode.PAPER))

        count, _ = repo.get_validation_stats("SPY", "s1")
        assert count == 1

    def test_first_trade_at_is_timezone_aware(self):
        # Regressione: SQLite non conserva il timezone, un confronto con
        # datetime.now(timezone.utc) altrove (execution.gate) deve restare possibile.
        repo = make_repository()
        old = datetime.now(timezone.utc) - timedelta(days=10)
        repo.record_order(_order(symbol="SPY", strategy_name="s1", created_at=old))

        _, first_at = repo.get_validation_stats("SPY", "s1")

        assert first_at is not None
        assert first_at.tzinfo is not None
        delta = datetime.now(timezone.utc) - first_at  # non deve sollevare TypeError
        assert delta.days >= 9
