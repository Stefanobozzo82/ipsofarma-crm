#!/usr/bin/env python3
"""Demo end-to-end: data ingestion -> strategy engine -> risk management.

Legge le barre già storicizzate nel DB locale (esegui prima
`fetch_sample_data.py`), genera i segnali (modulo 2) e li valuta con il
risk manager (modulo 3), stampando l'esito completo con la motivazione.

Comportamento "safe by default": se `config/risk_limits.yaml` non è
compilato ed abilitato esplicitamente (lo stato in cui il repository viene
distribuito), il risk manager si rifiuta di partire — è il comportamento
corretto, non un bug. In quel caso questo script lo segnala chiaramente e
prosegue con dei limiti di ESEMPIO tenuti solo in memoria (mai letti da
file, mai usati per operare realmente) così puoi comunque vedere la pipeline
completa in azione.
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
from trading_system.risk_management import RiskLimitsConfig, RiskManager, load_risk_limits
from trading_system.strategy_engine import StrategyEngine

logger = get_logger(__name__)

# Limiti di ESEMPIO, solo per questa demo, quando config/risk_limits.yaml
# non è ancora stato compilato dall'utente. Rispettano comunque il vincolo
# "crypto più stringente" — non sono un modo per aggirarlo.
_EXAMPLE_LIMITS = {
    "version": 1,
    "enabled": True,
    "equity": {"enabled": True, "max_portfolio_pct": 60.0, "max_position_pct": 10.0, "stop_loss_pct": 8.0, "max_volatility_annualized": 0.40},
    "etf": {"enabled": True, "max_portfolio_pct": 70.0, "max_position_pct": 15.0, "stop_loss_pct": 6.0, "max_volatility_annualized": 0.30},
    "crypto": {"enabled": True, "max_portfolio_pct": 15.0, "max_position_pct": 5.0, "stop_loss_pct": 5.0, "max_volatility_annualized": 0.25},
    "portfolio": {"max_drawdown_pct": 20.0, "max_daily_loss_pct": 5.0},
}
_EXAMPLE_ACCOUNT_EQUITY = 100_000.0


def _bars_to_dataframe(rows: list[MarketBarORM]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["timestamp", "close"])
    return pd.DataFrame([{"timestamp": r.timestamp, "close": r.close} for r in rows]).sort_values("timestamp")


def load_watchlist() -> dict:
    with open(ASSETS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def _load_risk_manager() -> tuple[RiskManager, bool]:
    """Ritorna (RiskManager, using_example_limits)."""
    try:
        return RiskManager(config=load_risk_limits()), False
    except ConfigurationError as exc:
        print(f"\n⚠️  config/risk_limits.yaml non è pronto per operare: {exc}\n")
        print("    Uso limiti di ESEMPIO solo per questa demo (mai letti da file, mai per operare davvero).\n")
        return RiskManager(config=RiskLimitsConfig(**_EXAMPLE_LIMITS)), True


def _print_decision(symbol: str, decision) -> None:
    verdict = "APPROVATO" if decision.approved else "RIFIUTATO"
    print(f"[{symbol}] {verdict} — {decision.action.value.upper()} qty={decision.quantity:.4f} — {decision.reason}")


def main() -> None:
    settings = get_settings()
    configure_logging(log_level=settings.log_level, logs_dir=LOGS_DIR)

    engine = create_sqlite_engine(settings.resolved_database_url)
    repo = MarketDataRepository(engine)
    strategy_engine = StrategyEngine()
    risk_manager, using_example_limits = _load_risk_manager()
    watchlist = load_watchlist()

    if using_example_limits:
        print("=== ATTENZIONE: risultati con limiti di ESEMPIO, non con i tuoi limiti reali ===\n")

    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)

    for asset_class, section in (
        (AssetClass.ETF, "etf"),
        (AssetClass.EQUITY, "equity"),
        (AssetClass.CRYPTO, "crypto"),
    ):
        print(f"\n=== {section.upper()} ===")
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
                _print_decision(symbol, decision)


if __name__ == "__main__":
    main()
