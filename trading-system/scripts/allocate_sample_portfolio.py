#!/usr/bin/env python3
"""Demo end-to-end: data ingestion -> strategy engine -> risk management -> portfolio allocator.

Come `evaluate_sample_risk.py`, usa limiti di rischio di ESEMPIO se
`config/risk_limits.yaml` non è ancora compilato (comportamento "safe by
default": mai per operare davvero). `config/portfolio.yaml` invece viene
sempre letto dal file reale e validato contro i limiti in uso (reali o di
esempio): è progettato per essere compatibile con entrambi.

Simula un conto con equity fissa e nessuna posizione aperta, così puoi
vedere sia l'arbitraggio di budget (`allocate`) sia il ribilanciamento da
zero (`check_rebalance` suggerisce di aprire posizioni per raggiungere i
target del profilo attivo).
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
from trading_system.portfolio import PortfolioAllocator, PortfolioConfig, load_portfolio_config
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
# Nessuna posizione aperta: un conto "da zero", per mostrare sia
# l'allocazione sia il ribilanciamento iniziale verso i target.
_EXAMPLE_POSITIONS_VALUE: dict[AssetClass, float] = {}


def _bars_to_dataframe(rows: list[MarketBarORM]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["timestamp", "close"])
    return pd.DataFrame([{"timestamp": r.timestamp, "close": r.close} for r in rows]).sort_values("timestamp")


def load_watchlist() -> dict:
    with open(ASSETS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _load_risk_limits() -> tuple[RiskLimitsConfig, bool]:
    """Ritorna (RiskLimitsConfig, using_example_limits)."""
    try:
        return load_risk_limits(), False
    except ConfigurationError as exc:
        print(f"\n⚠️  config/risk_limits.yaml non è pronto per operare: {exc}\n")
        print("    Uso limiti di rischio di ESEMPIO solo per questa demo.\n")
        return RiskLimitsConfig(**_EXAMPLE_RISK_LIMITS), True


def main() -> None:
    settings = get_settings()
    configure_logging(log_level=settings.log_level, logs_dir=LOGS_DIR)

    engine = create_sqlite_engine(settings.resolved_database_url)
    repo = MarketDataRepository(engine)
    strategy_engine = StrategyEngine()
    risk_limits, using_example_limits = _load_risk_limits()
    risk_manager = RiskManager(config=risk_limits)
    portfolio_config: PortfolioConfig = load_portfolio_config(risk_limits)
    allocator = PortfolioAllocator(portfolio_config)

    if using_example_limits:
        print("=== ATTENZIONE: risultati con limiti di rischio di ESEMPIO, non con i tuoi limiti reali ===\n")

    print(f"Profilo di allocazione attivo: '{portfolio_config.active_profile}' -> {allocator.target_weights()}\n")

    watchlist = load_watchlist()
    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)
    all_risk_decisions = []

    for asset_class, section in (
        (AssetClass.ETF, "etf"), (AssetClass.EQUITY, "equity"), (AssetClass.CRYPTO, "crypto"),
    ):
        for item in watchlist.get(section, []):
            symbol = item["symbol"]
            bars = _bars_to_dataframe(repo.get_bars(symbol, asset_class, Timeframe.DAY_1))
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

    print("=== Arbitraggio di budget di portafoglio ===")
    allocation_results = allocator.allocate(all_risk_decisions, _EXAMPLE_POSITIONS_VALUE, _EXAMPLE_ACCOUNT_EQUITY)
    if not allocation_results:
        print("Nessuna RiskDecision da allocare (nessun dato storicizzato?).")
    for result in allocation_results:
        verdict = "APPROVATO" if result.approved else "RIFIUTATO"
        print(f"[{result.symbol}] {verdict} — {result.action.value.upper()} qty={result.quantity:.4f} — {result.reason}")

    print("\n=== Ribilanciamento suggerito (rispetto al profilo attivo) ===")
    rebalance_actions = allocator.check_rebalance(_EXAMPLE_POSITIONS_VALUE, _EXAMPLE_ACCOUNT_EQUITY)
    if not rebalance_actions:
        print("Nessuno scostamento oltre la soglia configurata.")
    for action in rebalance_actions:
        print(f"[{action.asset_class.value}] {action.action.value.upper()} — {action.reason}")


if __name__ == "__main__":
    main()
