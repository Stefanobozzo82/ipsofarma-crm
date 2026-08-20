#!/usr/bin/env python3
"""Demo end-to-end: data ingestion -> strategy engine -> risk management ->
portfolio allocator -> execution (paper trading).

Esegue l'intera pipeline sui dati storicizzati e invia le allocazioni
approvate all'`ExecutionManager`, sempre in modalità paper (il default
sicuro di `config/execution.yaml`): nessuna operazione reale può partire da
questo script, a prescindere da cosa succede a monte.

Come gli script precedenti, usa limiti di rischio di ESEMPIO se
config/risk_limits.yaml non è ancora compilato.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import pandas as pd
import yaml

from config.settings import ASSETS_PATH, LOGS_DIR, get_settings
from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import ConfigurationError, DataSourceError
from trading_system.common.logging_config import configure_logging, get_logger
from trading_system.data_ingestion import EquityYFinanceSource, MarketDataRepository
from trading_system.data_ingestion.storage import MarketBarORM, create_sqlite_engine
from trading_system.execution import ExecutionManager, ExecutionRepository, load_execution_config
from trading_system.execution.storage import create_sqlite_engine as create_execution_engine
from trading_system.portfolio import PortfolioAllocator, load_portfolio_config
from trading_system.risk_management import RiskLimitsConfig, RiskManager, load_risk_limits
from trading_system.strategy_engine import StrategyEngine

logger = get_logger(__name__)

_EXAMPLE_RISK_LIMITS = {
    "version": 1,
    "enabled": True,
    "equity": {"enabled": True, "max_portfolio_pct": 60.0, "max_position_pct": 10.0, "stop_loss_pct": 8.0, "max_volatility_annualized": 0.40},
    "etf": {"enabled": True, "max_portfolio_pct": 70.0, "max_position_pct": 15.0, "stop_loss_pct": 6.0, "max_volatility_annualized": 0.30},
    "crypto": {"enabled": True, "max_portfolio_pct": 15.0, "max_position_pct": 5.0, "stop_loss_pct": 5.0, "max_volatility_annualized": 0.25},
    "portfolio": {"max_drawdown_pct": 20.0, "max_daily_loss_pct": 5.0},
}
_EXAMPLE_ACCOUNT_EQUITY = 100_000.0
_EXAMPLE_POSITIONS_VALUE: dict[AssetClass, float] = {}


def _bars_to_dataframe(rows: list[MarketBarORM]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["timestamp", "close"])
    return pd.DataFrame([{"timestamp": r.timestamp, "close": r.close} for r in rows]).sort_values("timestamp")


def load_watchlist() -> dict:
    with open(ASSETS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _load_risk_limits() -> tuple[RiskLimitsConfig, bool]:
    try:
        return load_risk_limits(), False
    except ConfigurationError as exc:
        print(f"\n⚠️  config/risk_limits.yaml non è pronto: {exc}\n    Uso limiti di ESEMPIO solo per questa demo.\n")
        return RiskLimitsConfig(**_EXAMPLE_RISK_LIMITS), True


def main() -> None:
    settings = get_settings()
    configure_logging(log_level=settings.log_level, logs_dir=LOGS_DIR)

    data_engine = create_sqlite_engine(settings.resolved_database_url)
    data_repo = MarketDataRepository(data_engine)
    execution_engine = create_execution_engine(settings.resolved_database_url)
    execution_repo = ExecutionRepository(execution_engine)

    strategy_engine = StrategyEngine()
    risk_limits, using_example_limits = _load_risk_limits()
    risk_manager = RiskManager(config=risk_limits)
    portfolio_allocator = PortfolioAllocator(load_portfolio_config(risk_limits))
    execution_config = load_execution_config()

    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)

    def price_provider(symbol: str, asset_class: AssetClass) -> float:
        bars = _bars_to_dataframe(data_repo.get_bars(symbol, asset_class, Timeframe.DAY_1))
        if bars.empty:
            raise DataSourceError(f"Nessun prezzo storicizzato per {symbol}")
        return float(bars["close"].iloc[-1])

    execution_manager = ExecutionManager(execution_config, execution_repo, price_provider)

    if using_example_limits:
        print("=== ATTENZIONE: risultati con limiti di rischio di ESEMPIO ===\n")
    print(f"Modalità execution: '{execution_config.mode}' (paper è sempre il default sicuro)\n")

    watchlist = load_watchlist()
    all_risk_decisions = []

    for asset_class, section in (
        (AssetClass.ETF, "etf"), (AssetClass.EQUITY, "equity"), (AssetClass.CRYPTO, "crypto"),
    ):
        for item in watchlist.get(section, []):
            symbol = item["symbol"]
            bars = _bars_to_dataframe(data_repo.get_bars(symbol, asset_class, Timeframe.DAY_1))
            if bars.empty:
                print(f"[{symbol}] nessun dato storicizzato: esegui prima fetch_sample_data.py")
                continue

            context = {}
            if asset_class == AssetClass.EQUITY:
                try:
                    context["fundamentals"] = equity_source.get_fundamentals(symbol)
                except DataSourceError as exc:
                    logger.warning("Fondamentali non disponibili per %s: %s", symbol, exc)

            for signal in strategy_engine.generate_signals(symbol, asset_class, bars, **context):
                decision = risk_manager.evaluate_signal(signal, bars, account_equity=_EXAMPLE_ACCOUNT_EQUITY)
                all_risk_decisions.append(decision)

    allocation_results = portfolio_allocator.allocate(
        all_risk_decisions, _EXAMPLE_POSITIONS_VALUE, _EXAMPLE_ACCOUNT_EQUITY,
    )

    print("=== Esecuzione (paper trading) ===")
    if not allocation_results:
        print("Nessuna AllocationDecision da eseguire.")
    for allocation in allocation_results:
        order = execution_manager.execute(allocation)
        verdict = order.status.value.upper()
        print(f"[{order.symbol}] {verdict} — {order.side.value.upper()} qty={order.quantity:.4f} — {order.reason}")

    print(f"\nCassa paper residua: {execution_manager.paper_broker.get_cash():.2f}")
    positions = execution_manager.paper_broker.get_positions()
    if positions:
        print("Posizioni paper aperte:")
        for p in positions:
            print(f"  {p.symbol}: {p.quantity:.6f} @ {p.average_entry_price:.4f}")
    else:
        print("Nessuna posizione paper aperta.")


if __name__ == "__main__":
    main()
