#!/usr/bin/env python3
"""Demo end-to-end: data ingestion -> strategy engine + risk management -> backtesting.

Esegue un backtest walk-forward per ogni simbolo della watchlist, usando le
stesse istanze di `StrategyEngine` e `RiskManager` che opererebbero dal
vivo (vedi `trading_system.backtesting.engine` per il perché), stampa le
metriche per simbolo, l'esito di eleggibilità (config/backtesting.yaml) e
le metriche aggregate per asset class e sul totale.

Come gli script precedenti, usa limiti di rischio di ESEMPIO se
config/risk_limits.yaml non è ancora compilato — mai per operare davvero.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import pandas as pd
import yaml

from config.settings import ASSETS_PATH, LOGS_DIR, get_settings
from trading_system.backtesting import (
    BacktestEngine,
    BacktestRun,
    aggregate_metrics,
    evaluate_eligibility,
    load_backtesting_config,
)
from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import ConfigurationError, DataSourceError
from trading_system.common.logging_config import configure_logging, get_logger
from trading_system.data_ingestion import EquityYFinanceSource, MarketDataRepository
from trading_system.data_ingestion.storage import MarketBarORM, create_sqlite_engine
from trading_system.risk_management import RiskLimitsConfig, RiskManager, load_risk_limits
from trading_system.strategy_engine import StrategyEngine

logger = get_logger(__name__)


# Nota sui valori di max_volatility_annualized: sono più larghi di quelli
# usati nelle demo degli script precedenti (evaluate_sample_risk.py,
# allocate_sample_portfolio.py), che mostrano deliberatamente il filtro
# bloccare le crypto. Qui l'obiettivo della demo è mostrare la meccanica
# del backtest engine (metriche, eleggibilità, aggregazione): con la soglia
# più stretta (25%) usata altrove, la volatilità storica di BTC/ETH la
# supera quasi sempre e non si genererebbe mai un trade da mostrare. Il
# vincolo "crypto più stringente di equity/etf" resta comunque rispettato.
_EXAMPLE_RISK_LIMITS = {
    "version": 1,
    "enabled": True,
    "equity": {"enabled": True, "max_portfolio_pct": 60.0, "max_position_pct": 10.0, "stop_loss_pct": 8.0, "max_volatility_annualized": 0.45},
    "etf": {"enabled": True, "max_portfolio_pct": 70.0, "max_position_pct": 15.0, "stop_loss_pct": 6.0, "max_volatility_annualized": 0.40},
    "crypto": {"enabled": True, "max_portfolio_pct": 15.0, "max_position_pct": 5.0, "stop_loss_pct": 5.0, "max_volatility_annualized": 0.35},
    "portfolio": {"max_drawdown_pct": 20.0, "max_daily_loss_pct": 5.0},
}


def _bars_to_dataframe(rows: list[MarketBarORM]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["timestamp", "close", "open", "high", "low", "volume"])
    return pd.DataFrame(
        [{"timestamp": r.timestamp, "open": r.open, "high": r.high, "low": r.low, "close": r.close, "volume": r.volume} for r in rows]
    ).sort_values("timestamp")


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

    engine_db = create_sqlite_engine(settings.resolved_database_url)
    repo = MarketDataRepository(engine_db)
    strategy_engine = StrategyEngine()
    risk_limits, using_example_limits = _load_risk_limits()
    risk_manager = RiskManager(config=risk_limits)
    backtesting_config = load_backtesting_config()
    backtest_engine = BacktestEngine(backtesting_config, strategy_engine, risk_manager, warmup_bars=60)

    if using_example_limits:
        print("=== ATTENZIONE: risultati con limiti di rischio di ESEMPIO ===\n")

    watchlist = load_watchlist()
    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)
    runs: list[BacktestRun] = []

    for asset_class, section in (
        (AssetClass.ETF, "etf"), (AssetClass.EQUITY, "equity"), (AssetClass.CRYPTO, "crypto"),
    ):
        for item in watchlist.get(section, []):
            symbol = item["symbol"]
            bars = _bars_to_dataframe(repo.get_bars(symbol, asset_class, Timeframe.DAY_1))
            if bars.empty:
                print(f"[{symbol}] nessun dato storicizzato: esegui prima fetch_sample_data.py")
                continue

            fundamentals = None
            if asset_class == AssetClass.EQUITY:
                try:
                    fundamentals = equity_source.get_fundamentals(symbol)
                except DataSourceError as exc:
                    logger.warning("Fondamentali non disponibili per %s: %s", symbol, exc)

            try:
                run = backtest_engine.run(symbol, asset_class, bars, fundamentals=fundamentals)
            except ValueError as exc:
                print(f"[{symbol}] backtest non eseguibile: {exc}")
                continue

            runs.append(run)
            r = run.result
            print(
                f"\n[{symbol}] trades={r.num_trades} rendimento={r.total_return_pct:+.2f}% "
                f"drawdown_max={r.max_drawdown_pct:.2f}% sharpe={r.sharpe_ratio:.2f} "
                f"win_rate={r.win_rate_pct:.1f}%"
            )
            eligibility = evaluate_eligibility(r, backtesting_config.eligibility)
            verdict = "IDONEO per il live" if eligibility.approved else "NON idoneo per il live"
            print(f"  -> {verdict}: {eligibility.reason}")

    if not runs:
        print("\nNessun backtest eseguito (nessun dato storicizzato?).")
        return

    print("\n=== Metriche aggregate per asset class ===")
    for asset_class in (AssetClass.ETF, AssetClass.EQUITY, AssetClass.CRYPTO):
        if not any(r.result.asset_class == asset_class for r in runs):
            continue
        summary = aggregate_metrics(runs, asset_class=asset_class)
        print(
            f"[{asset_class.value}] simboli={summary.num_symbols} trades={summary.num_trades} "
            f"rendimento={summary.total_return_pct:+.2f}% drawdown_max={summary.max_drawdown_pct:.2f}% "
            f"sharpe={summary.sharpe_ratio:.2f}"
        )

    print("\n=== Metriche aggregate sul totale portafoglio ===")
    total = aggregate_metrics(runs, asset_class=None)
    print(
        f"simboli={total.num_symbols} trades={total.num_trades} rendimento={total.total_return_pct:+.2f}% "
        f"drawdown_max={total.max_drawdown_pct:.2f}% sharpe={total.sharpe_ratio:.2f}"
    )


if __name__ == "__main__":
    main()
