"""Endpoint: storico operazioni, con la motivazione di ogni trade."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from trading_system.api.dependencies import get_execution_repo
from trading_system.api.reporting import build_order_history
from trading_system.api.schemas import OrderView
from trading_system.execution.storage import ExecutionRepository

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderView])
def list_orders(
    symbol: str | None = Query(default=None, description="Filtra per simbolo"),
    limit: int | None = Query(default=100, ge=1, le=1000, description="Numero massimo di ordini, i più recenti prima"),
    execution_repo: ExecutionRepository = Depends(get_execution_repo),
) -> list[OrderView]:
    """Storico ordini (paper e live), più recenti prima, ognuno con la propria motivazione."""
    return build_order_history(execution_repo, symbol=symbol, limit=limit)
