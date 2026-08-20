"""Test della logica di reporting (indipendente da FastAPI)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from tests.api.conftest import (
    build_portfolio_config,
    build_risk_limits,
    make_execution_repo,
    make_market_data_repo,
    seed_order,
    seed_price,
)
from trading_system.api.reporting import build_alerts, build_order_history, build_portfolio_summary
from trading_system.common.enums import AssetClass, OrderStatus


class TestPortfolioSummary:
    def test_empty_account_has_zero_equity(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()

        summary = build_portfolio_summary(execution_repo, market_repo)

        assert summary.cash == 0.0
        assert summary.total_equity == 0.0
        assert summary.positions == []

    def test_position_is_valued_at_current_price(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.ensure_paper_account(100_000.0)
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        seed_price(market_repo, "SPY", AssetClass.ETF, 110.0)

        summary = build_portfolio_summary(execution_repo, market_repo)

        [position] = summary.positions
        assert position.current_price == 110.0
        assert position.market_value == pytest.approx(1100.0)
        assert position.unrealized_pnl == pytest.approx(100.0)
        assert position.unrealized_pnl_pct == pytest.approx(10.0)
        assert summary.total_equity == pytest.approx(100_000.0 + 1100.0)

    def test_position_without_price_data_has_null_valuation(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.ensure_paper_account(100_000.0)
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        # nessun prezzo storicizzato per SPY

        summary = build_portfolio_summary(execution_repo, market_repo)

        [position] = summary.positions
        assert position.current_price is None
        assert position.market_value is None
        assert position.unrealized_pnl is None

    def test_asset_class_aggregation_and_weights(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.ensure_paper_account(100_000.0)
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        seed_price(market_repo, "SPY", AssetClass.ETF, 100.0)  # valore 1000

        summary = build_portfolio_summary(execution_repo, market_repo)

        etf_summary = next(a for a in summary.asset_classes if a.asset_class == "etf")
        assert etf_summary.current_value == pytest.approx(1000.0)
        assert etf_summary.position_count == 1
        assert etf_summary.current_weight_pct == pytest.approx(1000.0 / summary.total_equity * 100.0)

    def test_target_weight_populated_when_portfolio_config_given(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()

        summary = build_portfolio_summary(execution_repo, market_repo, build_portfolio_config())

        etf_summary = next(a for a in summary.asset_classes if a.asset_class == "etf")
        assert etf_summary.target_weight_pct == 50.0
        assert summary.portfolio_config_available is True

    def test_target_weight_is_none_without_portfolio_config(self):
        summary = build_portfolio_summary(make_execution_repo(), make_market_data_repo(), None)

        assert all(a.target_weight_pct is None for a in summary.asset_classes)
        assert summary.portfolio_config_available is False


class TestOrderHistory:
    def test_returns_orders_newest_first(self):
        repo = make_execution_repo()
        old = datetime.now(timezone.utc) - timedelta(days=1)
        new = datetime.now(timezone.utc)
        seed_order(repo, symbol="A", created_at=old)
        seed_order(repo, symbol="B", created_at=new)

        history = build_order_history(repo)

        assert [o.symbol for o in history] == ["B", "A"]

    def test_filters_by_symbol(self):
        repo = make_execution_repo()
        seed_order(repo, symbol="A")
        seed_order(repo, symbol="B")

        history = build_order_history(repo, symbol="A")

        assert len(history) == 1
        assert history[0].symbol == "A"

    def test_respects_limit(self):
        repo = make_execution_repo()
        for _ in range(5):
            seed_order(repo, symbol="A")

        history = build_order_history(repo, limit=2)

        assert len(history) == 2

    def test_order_view_carries_reason_for_traceability(self):
        repo = make_execution_repo()
        seed_order(repo, symbol="A", reason="motivazione di test specifica")

        [order] = build_order_history(repo)

        assert order.reason == "motivazione di test specifica"


class TestAlerts:
    def test_no_alerts_without_any_config(self):
        alerts = build_alerts(make_execution_repo(), make_market_data_repo(), None, None)
        assert alerts == []

    def test_rebalance_drift_alert_when_portfolio_config_given(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.ensure_paper_account(0.0)
        execution_repo.add_to_position("BTC/USDT", AssetClass.CRYPTO, 1.0, 100.0)
        seed_price(market_repo, "BTC/USDT", AssetClass.CRYPTO, 100.0)
        # crypto: 100% del portafoglio vs target 10% (balanced) => drift ben oltre soglia

        alerts = build_alerts(execution_repo, market_repo, None, build_portfolio_config())

        rebalance_alerts = [a for a in alerts if a.type == "rebalance_drift"]
        assert any(a.asset_class == "crypto" for a in rebalance_alerts)

    def test_no_rebalance_alerts_without_portfolio_config(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.ensure_paper_account(0.0)
        execution_repo.add_to_position("BTC/USDT", AssetClass.CRYPTO, 1.0, 100.0)
        seed_price(market_repo, "BTC/USDT", AssetClass.CRYPTO, 100.0)

        alerts = build_alerts(execution_repo, market_repo, None, None)

        assert [a for a in alerts if a.type == "rebalance_drift"] == []

    def test_stop_loss_breached_is_critical(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        # etf stop_loss_pct=6.0 => stop teorico a 94.0; prezzo attuale sotto
        seed_price(market_repo, "SPY", AssetClass.ETF, 90.0)

        alerts = build_alerts(execution_repo, market_repo, build_risk_limits(), None)

        [alert] = [a for a in alerts if a.type == "stop_loss_proximity"]
        assert alert.severity == "critical"
        assert alert.symbol == "SPY"

    def test_stop_loss_proximity_is_warning(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        # stop teorico 94.0, margine di default 5%: soglia prossimità ~98.7; 95 è sotto la soglia ma sopra lo stop
        seed_price(market_repo, "SPY", AssetClass.ETF, 95.0)

        alerts = build_alerts(execution_repo, market_repo, build_risk_limits(), None)

        [alert] = [a for a in alerts if a.type == "stop_loss_proximity"]
        assert alert.severity == "warning"

    def test_no_stop_loss_alert_when_safely_above(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        seed_price(market_repo, "SPY", AssetClass.ETF, 130.0)

        alerts = build_alerts(execution_repo, market_repo, build_risk_limits(), None)

        assert [a for a in alerts if a.type == "stop_loss_proximity"] == []

    def test_no_stop_loss_alerts_without_risk_limits(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        seed_price(market_repo, "SPY", AssetClass.ETF, 50.0)  # sarebbe sotto qualunque stop plausibile

        alerts = build_alerts(execution_repo, market_repo, None, None)

        assert [a for a in alerts if a.type == "stop_loss_proximity"] == []

    def test_repeated_rejections_alert(self):
        repo = make_execution_repo()
        for _ in range(3):
            seed_order(repo, symbol="SPY", status=OrderStatus.REJECTED)

        alerts = build_alerts(repo, make_market_data_repo(), None, None)

        [alert] = [a for a in alerts if a.type == "repeated_rejections"]
        assert alert.symbol == "SPY"
        assert alert.severity == "warning"

    def test_no_repeated_rejections_alert_when_mixed_outcomes(self):
        repo = make_execution_repo()
        seed_order(repo, symbol="SPY", status=OrderStatus.REJECTED)
        seed_order(repo, symbol="SPY", status=OrderStatus.FILLED)
        seed_order(repo, symbol="SPY", status=OrderStatus.REJECTED)

        alerts = build_alerts(repo, make_market_data_repo(), None, None)

        assert [a for a in alerts if a.type == "repeated_rejections"] == []

    def test_no_repeated_rejections_alert_below_threshold(self):
        repo = make_execution_repo()
        seed_order(repo, symbol="SPY", status=OrderStatus.REJECTED)
        seed_order(repo, symbol="SPY", status=OrderStatus.REJECTED)

        alerts = build_alerts(repo, make_market_data_repo(), None, None)

        assert [a for a in alerts if a.type == "repeated_rejections"] == []
