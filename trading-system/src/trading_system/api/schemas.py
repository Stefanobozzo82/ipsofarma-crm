"""Modelli di risposta dell'API (modulo 7 — dashboard).

Distinti dai modelli di dominio in `trading_system.common.models`: qui
sono "viste" pensate per l'esposizione HTTP (enum come stringhe semplici,
campi calcolati come `market_value`/`unrealized_pnl` che non esistono nel
dominio ma servono alla dashboard).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class PositionView(BaseModel):
    symbol: str
    asset_class: str
    quantity: float
    average_entry_price: float
    current_price: float | None
    market_value: float | None
    unrealized_pnl: float | None
    unrealized_pnl_pct: float | None


class AssetClassSummaryView(BaseModel):
    asset_class: str
    current_value: float
    current_weight_pct: float
    target_weight_pct: float | None  # None se config/portfolio.yaml non è disponibile
    position_count: int


class PortfolioSummaryView(BaseModel):
    cash: float
    total_equity: float
    asset_classes: list[AssetClassSummaryView]
    positions: list[PositionView]
    portfolio_config_available: bool  # False se i pesi target non sono disponibili (vedi target_weight_pct)
    generated_at: datetime


class OrderView(BaseModel):
    symbol: str
    asset_class: str
    side: str
    quantity: float
    mode: str
    broker: str
    strategy_name: str
    status: str
    reason: str
    filled_price: float | None
    filled_at: datetime | None
    created_at: datetime


class AlertView(BaseModel):
    type: str  # "rebalance_drift" | "stop_loss_proximity" | "repeated_rejections"
    severity: str  # "info" | "warning" | "critical"
    symbol: str | None
    asset_class: str | None
    message: str
    detected_at: datetime


class HealthView(BaseModel):
    status: str
    execution_mode: str | None  # "paper" | "live" | None se config/execution.yaml non è leggibile
    risk_limits_configured: bool
    portfolio_config_configured: bool
