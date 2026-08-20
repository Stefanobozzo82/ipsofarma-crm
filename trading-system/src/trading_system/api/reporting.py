"""Logica di reporting del modulo 7, indipendente da FastAPI.

Ogni funzione qui prende repository/configurazioni già caricate e ritorna
"viste" (`trading_system.api.schemas`) pronte per l'esposizione HTTP — sono
testabili direttamente, senza client HTTP, con lo stesso principio già
usato per l'orchestrazione degli altri moduli (funzioni pure sopra
repository/config iniettati).

Nota su cash/posizioni: il dashboard riflette lo stato del broker **paper**
(`ExecutionRepository`, tabelle `paper_account`/`paper_positions`) — non
esiste ancora un conto "live" da poter interrogare finché non attivi
l'esecuzione reale (modulo 6). Il prezzo corrente di ogni posizione è
l'ultima barra storicizzata nel modulo 1 (`MarketDataRepository`): se non
hai eseguito di recente `fetch_sample_data.py`, può essere non aggiornato —
la vista lo segnala con `current_price=None` quando manca del tutto.
"""

from __future__ import annotations

from datetime import datetime, timezone

from trading_system.common.enums import AssetClass, OrderStatus, Timeframe
from trading_system.api.schemas import (
    AlertView,
    AssetClassSummaryView,
    OrderView,
    PortfolioSummaryView,
    PositionView,
)
from trading_system.data_ingestion import MarketDataRepository
from trading_system.execution.storage import ExecutionRepository
from trading_system.portfolio import PortfolioAllocator, PortfolioConfig
from trading_system.risk_management.config_loader import RiskLimitsConfig

_ASSET_CLASSES = (AssetClass.EQUITY, AssetClass.ETF, AssetClass.CRYPTO)

#: Quanto ci si può avvicinare allo stop-loss teorico prima di segnalarlo
#: come alert "in prossimità" (non ancora superato). Parametro della vista,
#: non ancora esposto in config/*.yaml — soglia ragionevole di default.
_DEFAULT_STOP_LOSS_PROXIMITY_MARGIN_PCT = 5.0

#: Numero minimo di ordini rifiutati consecutivi (sugli ultimi 5) per
#: segnalare un alert "rifiuti ripetuti" su un simbolo.
_REPEATED_REJECTIONS_THRESHOLD = 3
_REPEATED_REJECTIONS_WINDOW = 5


def _latest_price(market_data_repo: MarketDataRepository, symbol: str, asset_class: AssetClass) -> float | None:
    bars = market_data_repo.get_bars(symbol, asset_class, Timeframe.DAY_1)
    if not bars:
        return None
    return float(bars[-1].close)


def build_portfolio_summary(
    execution_repo: ExecutionRepository,
    market_data_repo: MarketDataRepository,
    portfolio_config: PortfolioConfig | None = None,
) -> PortfolioSummaryView:
    """Stato del portafoglio paper: cassa, posizioni valorizzate, aggregato per asset class."""
    now = datetime.now(timezone.utc)
    cash = execution_repo.get_cash() if _has_paper_account(execution_repo) else 0.0
    position_rows = execution_repo.get_positions()

    positions: list[PositionView] = []
    value_by_class: dict[AssetClass, float] = {ac: 0.0 for ac in _ASSET_CLASSES}
    count_by_class: dict[AssetClass, int] = {ac: 0 for ac in _ASSET_CLASSES}

    for row in position_rows:
        asset_class = AssetClass(row.asset_class)
        current_price = _latest_price(market_data_repo, row.symbol, asset_class)
        market_value = current_price * row.quantity if current_price is not None else None
        unrealized_pnl = (
            (current_price - row.average_entry_price) * row.quantity if current_price is not None else None
        )
        unrealized_pnl_pct = (
            (current_price / row.average_entry_price - 1.0) * 100.0
            if current_price is not None and row.average_entry_price > 0
            else None
        )

        positions.append(
            PositionView(
                symbol=row.symbol,
                asset_class=asset_class.value,
                quantity=row.quantity,
                average_entry_price=row.average_entry_price,
                current_price=current_price,
                market_value=market_value,
                unrealized_pnl=unrealized_pnl,
                unrealized_pnl_pct=unrealized_pnl_pct,
            )
        )
        if market_value is not None:
            value_by_class[asset_class] += market_value
        count_by_class[asset_class] += 1

    total_equity = cash + sum(value_by_class.values())

    target_weights = None
    if portfolio_config is not None:
        target_weights = PortfolioAllocator(portfolio_config).target_weights()

    asset_class_summaries = [
        AssetClassSummaryView(
            asset_class=ac.value,
            current_value=value_by_class[ac],
            current_weight_pct=(value_by_class[ac] / total_equity * 100.0) if total_equity > 0 else 0.0,
            target_weight_pct=target_weights[ac] if target_weights is not None else None,
            position_count=count_by_class[ac],
        )
        for ac in _ASSET_CLASSES
    ]

    return PortfolioSummaryView(
        cash=cash,
        total_equity=total_equity,
        asset_classes=asset_class_summaries,
        positions=positions,
        portfolio_config_available=portfolio_config is not None,
        generated_at=now,
    )


def _has_paper_account(execution_repo: ExecutionRepository) -> bool:
    try:
        execution_repo.get_cash()
        return True
    except RuntimeError:
        return False


def build_order_history(
    execution_repo: ExecutionRepository,
    symbol: str | None = None,
    limit: int | None = None,
) -> list[OrderView]:
    """Storico ordini (paper e live), più recenti prima, con la motivazione di ognuno."""
    rows = execution_repo.list_orders(symbol=symbol)
    rows = sorted(rows, key=lambda r: r.created_at, reverse=True)
    if limit is not None:
        rows = rows[:limit]

    return [
        OrderView(
            symbol=row.symbol,
            asset_class=row.asset_class,
            side=row.side,
            quantity=row.quantity,
            mode=row.mode,
            broker=row.broker,
            strategy_name=row.strategy_name,
            status=row.status,
            reason=row.reason,
            filled_price=row.filled_price,
            filled_at=row.filled_at,
            created_at=row.created_at,
        )
        for row in rows
    ]


def build_alerts(
    execution_repo: ExecutionRepository,
    market_data_repo: MarketDataRepository,
    risk_limits: RiskLimitsConfig | None = None,
    portfolio_config: PortfolioConfig | None = None,
    stop_loss_proximity_margin_pct: float = _DEFAULT_STOP_LOSS_PROXIMITY_MARGIN_PCT,
) -> list[AlertView]:
    """Anomalie da segnalare: scostamento dal profilo target, posizioni vicine/oltre lo stop-loss, rifiuti ripetuti."""
    now = datetime.now(timezone.utc)
    alerts: list[AlertView] = []

    alerts.extend(_rebalance_alerts(execution_repo, market_data_repo, portfolio_config, now))
    alerts.extend(_stop_loss_alerts(execution_repo, market_data_repo, risk_limits, stop_loss_proximity_margin_pct, now))
    alerts.extend(_repeated_rejection_alerts(execution_repo, now))

    return alerts


def _rebalance_alerts(
    execution_repo: ExecutionRepository,
    market_data_repo: MarketDataRepository,
    portfolio_config: PortfolioConfig | None,
    now: datetime,
) -> list[AlertView]:
    if portfolio_config is None:
        return []

    position_rows = execution_repo.get_positions()
    value_by_class: dict[AssetClass, float] = {ac: 0.0 for ac in _ASSET_CLASSES}
    for row in position_rows:
        asset_class = AssetClass(row.asset_class)
        price = _latest_price(market_data_repo, row.symbol, asset_class)
        if price is not None:
            value_by_class[asset_class] += price * row.quantity

    cash = execution_repo.get_cash() if _has_paper_account(execution_repo) else 0.0
    total_equity = cash + sum(value_by_class.values())

    rebalance_actions = PortfolioAllocator(portfolio_config).check_rebalance(value_by_class, total_equity)
    return [
        AlertView(
            type="rebalance_drift", severity="warning", symbol=None,
            asset_class=action.asset_class.value, message=action.reason, detected_at=now,
        )
        for action in rebalance_actions
    ]


def _stop_loss_alerts(
    execution_repo: ExecutionRepository,
    market_data_repo: MarketDataRepository,
    risk_limits: RiskLimitsConfig | None,
    margin_pct: float,
    now: datetime,
) -> list[AlertView]:
    if risk_limits is None:
        return []

    alerts: list[AlertView] = []
    for row in execution_repo.get_positions():
        asset_class = AssetClass(row.asset_class)
        price = _latest_price(market_data_repo, row.symbol, asset_class)
        if price is None:
            continue

        stop_loss_pct = risk_limits.limits_for(asset_class).stop_loss_pct
        assumed_stop = row.average_entry_price * (1.0 - stop_loss_pct / 100.0)
        proximity_threshold = assumed_stop * (1.0 + margin_pct / 100.0)

        if price <= assumed_stop:
            alerts.append(
                AlertView(
                    type="stop_loss_proximity", severity="critical", symbol=row.symbol, asset_class=asset_class.value,
                    message=(
                        f"{row.symbol}: prezzo attuale {price:.4f} è sotto lo stop-loss teorico "
                        f"{assumed_stop:.4f} ({stop_loss_pct:.1f}% dal prezzo medio di carico "
                        f"{row.average_entry_price:.4f})."
                    ),
                    detected_at=now,
                )
            )
        elif price <= proximity_threshold:
            alerts.append(
                AlertView(
                    type="stop_loss_proximity", severity="warning", symbol=row.symbol, asset_class=asset_class.value,
                    message=(
                        f"{row.symbol}: prezzo attuale {price:.4f} entro il {margin_pct:.1f}% dallo stop-loss "
                        f"teorico {assumed_stop:.4f}."
                    ),
                    detected_at=now,
                )
            )
    return alerts


def _repeated_rejection_alerts(execution_repo: ExecutionRepository, now: datetime) -> list[AlertView]:
    orders = execution_repo.list_orders()
    by_symbol: dict[str, list] = {}
    for order in orders:
        by_symbol.setdefault(order.symbol, []).append(order)

    alerts: list[AlertView] = []
    for symbol, symbol_orders in by_symbol.items():
        recent = sorted(symbol_orders, key=lambda o: o.created_at, reverse=True)[:_REPEATED_REJECTIONS_WINDOW]
        rejected_count = sum(1 for o in recent if o.status == OrderStatus.REJECTED.value)
        if len(recent) >= _REPEATED_REJECTIONS_THRESHOLD and rejected_count == len(recent):
            alerts.append(
                AlertView(
                    type="repeated_rejections", severity="warning", symbol=symbol, asset_class=recent[0].asset_class,
                    message=(
                        f"{symbol}: ultimi {len(recent)} ordini tutti rifiutati "
                        f"(ultimo motivo: {recent[0].reason})."
                    ),
                    detected_at=now,
                )
            )
    return alerts
