"""Test di PaperBroker (modulo critico: è il percorso di esecuzione di default)."""

from __future__ import annotations

import pytest

from tests.execution.conftest import fixed_price_provider, make_repository
from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide, OrderStatus
from trading_system.execution.paper_broker import PaperBroker


def _broker(repo=None, price=100.0, initial_cash=100_000.0, commission_pct=0.0) -> PaperBroker:
    return PaperBroker(repo or make_repository(), fixed_price_provider(price), initial_cash, commission_pct)


class TestBuy:
    def test_successful_buy_reduces_cash_and_opens_position(self):
        repo = make_repository()
        broker = _broker(repo, price=100.0)

        order = broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy signal")

        assert order.status == OrderStatus.FILLED
        assert order.filled_price == 100.0
        assert order.mode == ExecutionMode.PAPER
        assert order.broker == "paper"
        assert broker.get_cash() == pytest.approx(99_000.0)
        position = broker.get_position("SPY")
        assert position.quantity == 10.0
        assert position.average_entry_price == 100.0

    def test_commission_is_deducted(self):
        repo = make_repository()
        broker = _broker(repo, price=100.0, commission_pct=1.0)  # 1% di commissione

        broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy")

        # costo = 10*100 + 1% di 1000 = 1010
        assert broker.get_cash() == pytest.approx(100_000.0 - 1010.0)

    def test_insufficient_cash_rejects(self):
        broker = _broker(price=100.0, initial_cash=500.0)

        order = broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy")

        assert order.status == OrderStatus.REJECTED
        assert "insufficiente" in order.reason
        assert broker.get_position("SPY") is None

    def test_second_buy_updates_weighted_average_price(self):
        repo = make_repository()
        broker1 = _broker(repo, price=100.0)
        broker1.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy")
        broker2 = PaperBroker(repo, fixed_price_provider(120.0), 100_000.0, 0.0)
        broker2.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy")

        position = broker2.get_position("SPY")
        assert position.quantity == 20.0
        assert position.average_entry_price == pytest.approx(110.0)


class TestSell:
    def test_successful_sell_increases_cash_and_reduces_position(self):
        repo = make_repository()
        broker = _broker(repo, price=100.0)
        broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy")

        order = broker.submit_order("SPY", AssetClass.ETF, OrderSide.SELL, 4.0, "s1", "sell signal")

        assert order.status == OrderStatus.FILLED
        assert broker.get_position("SPY").quantity == pytest.approx(6.0)

    def test_selling_full_position_removes_it(self):
        repo = make_repository()
        broker = _broker(repo, price=100.0)
        broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy")

        broker.submit_order("SPY", AssetClass.ETF, OrderSide.SELL, 10.0, "s1", "sell")

        assert broker.get_position("SPY") is None

    def test_selling_without_position_rejects_no_short_selling(self):
        broker = _broker(price=100.0)

        order = broker.submit_order("SPY", AssetClass.ETF, OrderSide.SELL, 5.0, "s1", "sell")

        assert order.status == OrderStatus.REJECTED
        assert "vendite allo scoperto" in order.reason

    def test_selling_more_than_held_rejects(self):
        repo = make_repository()
        broker = _broker(repo, price=100.0)
        broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 5.0, "s1", "buy")

        order = broker.submit_order("SPY", AssetClass.ETF, OrderSide.SELL, 10.0, "s1", "sell")

        assert order.status == OrderStatus.REJECTED


class TestEdgeCases:
    def test_non_positive_quantity_rejects(self):
        broker = _broker()
        order = broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 0.0, "s1", "buy")
        assert order.status == OrderStatus.REJECTED

    def test_price_provider_failure_rejects_gracefully(self):
        def broken_provider(symbol, asset_class):
            raise RuntimeError("prezzo non disponibile")

        broker = PaperBroker(make_repository(), broken_provider, 100_000.0, 0.0)

        order = broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy")

        assert order.status == OrderStatus.REJECTED
        assert "non disponibile" in order.reason

    def test_state_persists_across_broker_instances_sharing_repository(self):
        # Il "periodo di validazione" in paper trading richiede che lo stato
        # sopravviva a esecuzioni successive dello script/processo.
        repo = make_repository()
        PaperBroker(repo, fixed_price_provider(100.0), 100_000.0, 0.0).submit_order(
            "SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy"
        )

        reloaded_broker = PaperBroker(repo, fixed_price_provider(100.0), 999_999.0, 0.0)  # initial_cash ignorato: conto già esistente

        assert reloaded_broker.get_cash() == pytest.approx(99_000.0)
        assert reloaded_broker.get_position("SPY").quantity == 10.0

    def test_get_positions_returns_all_open_positions(self):
        repo = make_repository()
        broker = _broker(repo, price=100.0)
        broker.submit_order("SPY", AssetClass.ETF, OrderSide.BUY, 10.0, "s1", "buy")
        broker2 = PaperBroker(repo, fixed_price_provider(50_000.0), 100_000.0, 0.0)
        broker2.submit_order("BTC/USDT", AssetClass.CRYPTO, OrderSide.BUY, 0.001, "s1", "buy")

        symbols = {p.symbol for p in broker.get_positions()}
        assert symbols == {"SPY", "BTC/USDT"}
