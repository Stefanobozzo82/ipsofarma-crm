"""Endpoint: stato del portafoglio (aggregato e per asset class)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from trading_system.api.dependencies import get_execution_repo, get_market_data_repo, get_portfolio_config
from trading_system.api.reporting import build_portfolio_summary
from trading_system.api.schemas import PortfolioSummaryView
from trading_system.data_ingestion import MarketDataRepository
from trading_system.execution.storage import ExecutionRepository
from trading_system.portfolio.config_loader import PortfolioConfig

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioSummaryView)
def get_portfolio(
    execution_repo: ExecutionRepository = Depends(get_execution_repo),
    market_data_repo: MarketDataRepository = Depends(get_market_data_repo),
    portfolio_config: PortfolioConfig | None = Depends(get_portfolio_config),
) -> PortfolioSummaryView:
    """Cassa, posizioni valorizzate ai prezzi correnti, aggregato per asset class.

    `target_weight_pct` è `null` per ogni asset class se `config/portfolio.yaml`
    non è ancora caricabile (dipende da `config/risk_limits.yaml` compilato).
    """
    return build_portfolio_summary(execution_repo, market_data_repo, portfolio_config)
