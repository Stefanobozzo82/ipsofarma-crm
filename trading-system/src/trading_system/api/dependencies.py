"""Dependency injection FastAPI per l'API del modulo 7.

Legge lo stato applicativo (`request.app.state`), popolato da
`trading_system.api.app.create_app` — mai istanziato qui direttamente, così
i router restano testabili passando app diverse (es. con repository in
memoria nei test).
"""

from __future__ import annotations

from fastapi import Request

from trading_system.data_ingestion import MarketDataRepository
from trading_system.execution.storage import ExecutionRepository
from trading_system.portfolio.config_loader import PortfolioConfig
from trading_system.risk_management.config_loader import RiskLimitsConfig


def get_market_data_repo(request: Request) -> MarketDataRepository:
    return request.app.state.market_data_repo


def get_execution_repo(request: Request) -> ExecutionRepository:
    return request.app.state.execution_repo


def get_risk_limits(request: Request) -> RiskLimitsConfig | None:
    """`None` se `config/risk_limits.yaml` non è ancora compilato — non è un errore, è lo stato di partenza."""
    return request.app.state.risk_limits


def get_portfolio_config(request: Request) -> PortfolioConfig | None:
    """`None` se non disponibile (dipende da `get_risk_limits`, vedi `create_app`)."""
    return request.app.state.portfolio_config
