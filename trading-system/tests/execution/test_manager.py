"""Test di ExecutionManager (modulo critico: orchestra broker + gate + storico)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from config.settings import Settings
from tests.execution.conftest import (
    build_execution_config,
    fixed_price_provider,
    make_allocation_decision,
    make_eligibility,
    make_repository,
)
from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide, OrderStatus, SignalAction
from trading_system.common.exceptions import ConfigurationError
from trading_system.execution.broker_base import ExecutionBroker
from trading_system.execution.manager import ExecutionManager
from trading_system.execution.paper_broker import PaperBroker


class _FakeLiveBroker(ExecutionBroker):
    name = "fake-live"
    mode = ExecutionMode.LIVE

    def __init__(self):
        self.submitted = []

    def submit_order(self, symbol, asset_class, side, quantity, strategy_name, reason):
        from trading_system.common.models import Order

        now = datetime.now(timezone.utc)
        self.submitted.append((symbol, side, quantity))
        return Order(
            symbol=symbol, asset_class=asset_class, side=side, quantity=quantity,
            mode=self.mode, broker=self.name, strategy_name=strategy_name,
            status=OrderStatus.FILLED, reason=reason, filled_price=100.0, filled_at=now, created_at=now,
        )

    def get_cash(self) -> float:
        return 0.0

    def get_position(self, symbol: str):
        return None

    def get_positions(self):
        return []


def _manager(repo=None, config=None, settings=None, live_broker_factory=None) -> ExecutionManager:
    return ExecutionManager(
        config or build_execution_config(),
        repo or make_repository(),
        fixed_price_provider(100.0),
        settings=settings or Settings(_env_file=None),
        live_broker_factory=live_broker_factory,
    )


class TestRejectedOrHoldDecisions:
    def test_unapproved_decision_produces_rejected_order_without_touching_broker(self):
        repo = make_repository()
        manager = _manager(repo)
        decision = make_allocation_decision(approved=False, action=SignalAction.HOLD)

        order = manager.execute(decision)

        assert order.status == OrderStatus.REJECTED
        assert "non idonea" in order.reason
        assert len(repo.list_orders()) == 1

    def test_hold_action_produces_rejected_order(self):
        manager = _manager()
        decision = make_allocation_decision(action=SignalAction.HOLD, approved=True, quantity=0.0)

        order = manager.execute(decision)

        assert order.status == OrderStatus.REJECTED

    def test_zero_quantity_produces_rejected_order(self):
        manager = _manager()
        decision = make_allocation_decision(quantity=0.0)

        order = manager.execute(decision)

        assert order.status == OrderStatus.REJECTED


class TestPaperModeDefault:
    def test_paper_mode_always_uses_paper_broker(self):
        repo = make_repository()
        manager = _manager(repo, config=build_execution_config(mode="paper"))
        decision = make_allocation_decision()

        order = manager.execute(decision)

        assert order.mode == ExecutionMode.PAPER
        assert order.broker == "paper"
        assert order.status == OrderStatus.FILLED
        assert manager.paper_broker.get_position("SPY").quantity == pytest.approx(10.0)

    def test_every_order_is_recorded_exactly_once(self):
        repo = make_repository()
        manager = _manager(repo)
        manager.execute(make_allocation_decision(symbol="SPY"))
        manager.execute(make_allocation_decision(symbol="AAPL", approved=False, action=SignalAction.HOLD))

        assert len(repo.list_orders()) == 2


class TestLiveModeFallback:
    def test_live_mode_without_eligibility_falls_back_to_paper(self):
        repo = make_repository()
        manager = _manager(repo, config=build_execution_config(mode="live"))
        decision = make_allocation_decision()

        order = manager.execute(decision)  # nessun eligibility passato

        assert order.mode == ExecutionMode.PAPER
        assert "nessun BacktestEligibility" in order.reason

    def test_live_mode_with_rejected_eligibility_falls_back_to_paper(self):
        manager = _manager(config=build_execution_config(mode="live"))
        decision = make_allocation_decision()
        eligibility = make_eligibility(approved=False)

        order = manager.execute(decision, eligibility=eligibility, explicit_confirmation=True)

        assert order.mode == ExecutionMode.PAPER
        assert "live non autorizzato" in order.reason

    def test_live_mode_with_eligibility_but_no_confirmation_or_history_falls_back_to_paper(self):
        manager = _manager(config=build_execution_config(mode="live"))
        decision = make_allocation_decision()
        eligibility = make_eligibility()

        order = manager.execute(decision, eligibility=eligibility, explicit_confirmation=False)

        assert order.mode == ExecutionMode.PAPER

    def test_live_mode_gate_approved_but_broker_unavailable_falls_back_to_paper(self):
        # Nessuna credenziale nell'ambiente di test: il broker live reale
        # (Alpaca/ccxt) si rifiuta di essere costruito.
        settings = Settings(_env_file=None, live_trading_enabled=True)
        manager = _manager(config=build_execution_config(mode="live"), settings=settings)
        decision = make_allocation_decision(asset_class=AssetClass.CRYPTO, symbol="BTC/USDT")
        eligibility = make_eligibility(asset_class=AssetClass.CRYPTO, symbol="BTC/USDT")

        order = manager.execute(decision, eligibility=eligibility, explicit_confirmation=True)

        assert order.mode == ExecutionMode.PAPER
        assert "broker non disponibile" in order.reason


class TestLiveModeAuthorized:
    def test_gate_approved_and_broker_available_uses_live_broker(self):
        fake_broker = _FakeLiveBroker()
        settings = Settings(_env_file=None, live_trading_enabled=True)
        repo = make_repository()
        manager = _manager(
            repo, config=build_execution_config(mode="live"), settings=settings,
            live_broker_factory=lambda asset_class: fake_broker,
        )
        decision = make_allocation_decision()
        eligibility = make_eligibility()

        order = manager.execute(decision, eligibility=eligibility, explicit_confirmation=True)

        assert order.mode == ExecutionMode.LIVE
        assert order.broker == "fake-live"
        assert len(fake_broker.submitted) == 1
        assert len(repo.list_orders()) == 1  # registrato una volta sola, non due

    def test_paper_validation_path_also_authorizes_live_without_confirmation(self):
        from trading_system.common.models import Order

        fake_broker = _FakeLiveBroker()
        repo = make_repository()
        old = datetime.now(timezone.utc) - timedelta(days=20)
        for _ in range(5):
            repo.record_order(
                Order(
                    symbol="SPY", asset_class=AssetClass.ETF, side=OrderSide.BUY, quantity=1.0,
                    mode=ExecutionMode.PAPER, broker="paper", strategy_name="test_strategy",
                    status=OrderStatus.FILLED, reason="seed", filled_price=100.0, filled_at=old, created_at=old,
                )
            )
        manager = _manager(
            repo, config=build_execution_config(mode="live"),
            live_broker_factory=lambda asset_class: fake_broker,
        )
        decision = make_allocation_decision()
        eligibility = make_eligibility()

        order = manager.execute(decision, eligibility=eligibility, explicit_confirmation=False)

        assert order.mode == ExecutionMode.LIVE


class TestBrokerSelectionPerAssetClass:
    def test_default_live_broker_for_equity_is_alpaca_and_requires_credentials(self):
        settings = Settings(_env_file=None, live_trading_enabled=True)  # nessuna credenziale Alpaca impostata
        manager = _manager(config=build_execution_config(mode="live"), settings=settings)
        decision = make_allocation_decision(asset_class=AssetClass.EQUITY, symbol="AAPL")
        eligibility = make_eligibility(asset_class=AssetClass.EQUITY, symbol="AAPL")

        order = manager.execute(decision, eligibility=eligibility, explicit_confirmation=True)

        assert order.mode == ExecutionMode.PAPER  # niente credenziali => fallback sicuro
        assert "Alpaca" in order.reason or "ALPACA" in order.reason

    def test_unsupported_equity_broker_raises_configuration_error_internally_and_falls_back(self):
        settings = Settings(_env_file=None, live_trading_enabled=True)
        manager = _manager(
            config=build_execution_config(mode="live", live_brokers={"equity": "not_a_real_broker"}),
            settings=settings,
        )
        decision = make_allocation_decision(asset_class=AssetClass.EQUITY, symbol="AAPL")
        eligibility = make_eligibility(asset_class=AssetClass.EQUITY, symbol="AAPL")

        order = manager.execute(decision, eligibility=eligibility, explicit_confirmation=True)

        assert order.mode == ExecutionMode.PAPER
