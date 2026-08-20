"""Endpoint: alert su anomalie (scostamento dal profilo target, stop-loss, rifiuti ripetuti)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from trading_system.api.dependencies import (
    get_execution_repo,
    get_market_data_repo,
    get_portfolio_config,
    get_risk_limits,
)
from trading_system.api.reporting import build_alerts
from trading_system.api.schemas import AlertView
from trading_system.data_ingestion import MarketDataRepository
from trading_system.execution.storage import ExecutionRepository
from trading_system.portfolio.config_loader import PortfolioConfig
from trading_system.risk_management.config_loader import RiskLimitsConfig

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertView])
def get_alerts(
    execution_repo: ExecutionRepository = Depends(get_execution_repo),
    market_data_repo: MarketDataRepository = Depends(get_market_data_repo),
    risk_limits: RiskLimitsConfig | None = Depends(get_risk_limits),
    portfolio_config: PortfolioConfig | None = Depends(get_portfolio_config),
) -> list[AlertView]:
    """Anomalie rilevate: scostamento dal profilo target, posizioni vicine/oltre lo stop-loss, rifiuti ripetuti.

    Le sezioni che dipendono da `config/risk_limits.yaml`/`config/portfolio.yaml`
    non compilati semplicemente non producono alert (lista vuota per quella
    categoria), non un errore.
    """
    return build_alerts(execution_repo, market_data_repo, risk_limits, portfolio_config)
