"""Modulo 7 — Dashboard/report: factory dell'app FastAPI.

Sola lettura: nessun endpoint qui genera segnali, valuta rischio, alloca
budget o esegue ordini — quella logica vive nei moduli 2-6 e viene
richiamata da script/scheduler, non dalla dashboard. Il modulo 7 espone
solo ciò che è già successo (`ExecutionRepository`) e i prezzi già
storicizzati (`MarketDataRepository`), più i calcoli derivati (pesi vs
target, alert) definiti in `reporting.py`.

`create_app` accetta repository/config già costruiti (per i test); usata
senza argomenti, apre le connessioni reali configurate in
`config/settings.py` e tenta di caricare `risk_limits`/`portfolio_config`
— se non sono ancora compilati (stato di partenza del progetto), la
dashboard resta comunque utilizzabile: le sezioni che ne dipendono
(pesi target, alert di ribilanciamento/stop-loss) restano vuote/`null`
invece di far fallire l'avvio.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from config.settings import get_settings
from trading_system.common.exceptions import ConfigurationError
from trading_system.common.logging_config import get_logger
from trading_system.data_ingestion import MarketDataRepository
from trading_system.data_ingestion.storage import create_sqlite_engine as create_data_engine
from trading_system.execution.storage import ExecutionRepository
from trading_system.execution.storage import create_sqlite_engine as create_execution_engine
from trading_system.portfolio.config_loader import PortfolioConfig, load_portfolio_config
from trading_system.risk_management.config_loader import RiskLimitsConfig, load_risk_limits

from trading_system.api.routers import alerts, orders, portfolio

logger = get_logger(__name__)


def _try_load_risk_limits() -> RiskLimitsConfig | None:
    try:
        return load_risk_limits()
    except ConfigurationError as exc:
        logger.warning("Dashboard avviata senza risk_limits (non compilato): %s", exc)
        return None


def _try_load_portfolio_config(risk_limits: RiskLimitsConfig | None) -> PortfolioConfig | None:
    if risk_limits is None:
        return None
    try:
        return load_portfolio_config(risk_limits)
    except ConfigurationError as exc:
        logger.warning("Dashboard avviata senza portfolio_config: %s", exc)
        return None


#: Sentinella per distinguere "parametro non passato" (carica da file, con
#: fallback a None se non compilato) da "passato esplicitamente None" (i
#: test possono così forzare lo stato "non configurato" senza toccare il
#: filesystem). Un default `None` semplice non permetterebbe la distinzione.
_UNSET: Any = object()


def create_app(
    market_data_repo: MarketDataRepository | None = None,
    execution_repo: ExecutionRepository | None = None,
    risk_limits: RiskLimitsConfig | None | Any = _UNSET,
    portfolio_config: PortfolioConfig | None | Any = _UNSET,
) -> FastAPI:
    """Costruisce l'app FastAPI. Senza argomenti, usa le connessioni/config reali del progetto."""
    app = FastAPI(
        title="Trading System — Dashboard",
        description="Stato del portafoglio, storico operazioni, alert su anomalie. Sola lettura.",
        version="1.0.0",
    )

    if market_data_repo is None:
        settings = get_settings()
        market_data_repo = MarketDataRepository(create_data_engine(settings.resolved_database_url))
    if execution_repo is None:
        settings = get_settings()
        execution_repo = ExecutionRepository(create_execution_engine(settings.resolved_database_url))

    resolved_risk_limits = _try_load_risk_limits() if risk_limits is _UNSET else risk_limits
    resolved_portfolio_config = (
        _try_load_portfolio_config(resolved_risk_limits) if portfolio_config is _UNSET else portfolio_config
    )

    app.state.market_data_repo = market_data_repo
    app.state.execution_repo = execution_repo
    app.state.risk_limits = resolved_risk_limits
    app.state.portfolio_config = resolved_portfolio_config

    app.include_router(portfolio.router)
    app.include_router(orders.router)
    app.include_router(alerts.router)

    @app.get("/health", tags=["health"])
    def health() -> dict:
        return {
            "status": "ok",
            "risk_limits_configured": app.state.risk_limits is not None,
            "portfolio_config_configured": app.state.portfolio_config is not None,
        }

    return app
