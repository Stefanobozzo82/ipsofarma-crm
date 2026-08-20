"""Test dell'app FastAPI (modulo 7) via TestClient — nessun server reale avviato."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.api.conftest import (
    build_portfolio_config,
    build_risk_limits,
    make_execution_repo,
    make_market_data_repo,
    seed_order,
    seed_price,
)
from trading_system.api.app import create_app
from trading_system.common.enums import AssetClass


def _client(risk_limits=None, portfolio_config=None, market_repo=None, execution_repo=None) -> TestClient:
    app = create_app(
        market_data_repo=market_repo or make_market_data_repo(),
        execution_repo=execution_repo or make_execution_repo(),
        risk_limits=risk_limits,
        portfolio_config=portfolio_config,
    )
    return TestClient(app)


class TestHealth:
    def test_health_reports_unconfigured_state(self):
        client = _client()

        response = client.get("/health")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["risk_limits_configured"] is False
        assert body["portfolio_config_configured"] is False

    def test_health_reports_configured_state(self):
        client = _client(risk_limits=build_risk_limits(), portfolio_config=build_portfolio_config())

        body = client.get("/health").json()

        assert body["risk_limits_configured"] is True
        assert body["portfolio_config_configured"] is True


class TestPortfolioEndpoint:
    def test_returns_200_with_empty_account(self):
        response = _client().get("/portfolio")

        assert response.status_code == 200
        body = response.json()
        assert body["cash"] == 0.0
        assert body["positions"] == []
        assert len(body["asset_classes"]) == 3

    def test_reflects_seeded_position(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.ensure_paper_account(50_000.0)
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        seed_price(market_repo, "SPY", AssetClass.ETF, 105.0)

        response = _client(market_repo=market_repo, execution_repo=execution_repo).get("/portfolio")

        body = response.json()
        assert body["cash"] == 50_000.0
        [position] = body["positions"]
        assert position["symbol"] == "SPY"
        assert position["current_price"] == 105.0


class TestOrdersEndpoint:
    def test_returns_seeded_orders(self):
        execution_repo = make_execution_repo()
        seed_order(execution_repo, symbol="SPY", reason="motivo tracciabile")

        response = _client(execution_repo=execution_repo).get("/orders")

        assert response.status_code == 200
        [order] = response.json()
        assert order["symbol"] == "SPY"
        assert order["reason"] == "motivo tracciabile"

    def test_symbol_query_param_filters(self):
        execution_repo = make_execution_repo()
        seed_order(execution_repo, symbol="SPY")
        seed_order(execution_repo, symbol="AAPL")

        response = _client(execution_repo=execution_repo).get("/orders", params={"symbol": "AAPL"})

        body = response.json()
        assert len(body) == 1
        assert body[0]["symbol"] == "AAPL"

    def test_limit_query_param_is_respected(self):
        execution_repo = make_execution_repo()
        for _ in range(5):
            seed_order(execution_repo, symbol="SPY")

        response = _client(execution_repo=execution_repo).get("/orders", params={"limit": 2})

        assert len(response.json()) == 2

    def test_invalid_limit_rejected_with_422(self):
        response = _client().get("/orders", params={"limit": 0})

        assert response.status_code == 422


class TestAlertsEndpoint:
    def test_returns_empty_list_without_config(self):
        response = _client().get("/alerts")

        assert response.status_code == 200
        assert response.json() == []

    def test_returns_stop_loss_alert_when_configured(self):
        market_repo = make_market_data_repo()
        execution_repo = make_execution_repo()
        execution_repo.add_to_position("SPY", AssetClass.ETF, 10.0, 100.0)
        seed_price(market_repo, "SPY", AssetClass.ETF, 50.0)

        response = _client(
            risk_limits=build_risk_limits(), market_repo=market_repo, execution_repo=execution_repo,
        ).get("/alerts")

        body = response.json()
        assert any(a["type"] == "stop_loss_proximity" for a in body)
