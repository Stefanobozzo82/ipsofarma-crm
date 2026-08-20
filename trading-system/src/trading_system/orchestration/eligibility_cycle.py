"""Modulo 8 — ricalcolo periodico dell'eleggibilità al trading live (modulo 5).

Il ciclo di trading quotidiano (`orchestration.cycle.run_cycle`) non calcola
mai un backtest: è costoso rifarlo ad ogni giro e richiede uno storico molto
più lungo della finestra dati che quel ciclo mantiene aggiornata (default 30
giorni). Questo è un job separato, pensato per una cadenza più bassa (es.
settimanale — vedi `.github/workflows/eligibility-refresh.yml`), che:

1. scarica uno storico lungo (default ~2 anni) per ogni simbolo della
   watchlist, upsertandolo nello stesso `MarketDataRepository` del ciclo
   quotidiano (idempotente: non duplica le barre già presenti);
2. fa girare `BacktestEngine` con le STESSE istanze di `StrategyEngine` e
   `RiskManager` che il ciclo di trading userebbe dal vivo — coerente col
   principio del modulo 5, "backtest positivo" deve dire qualcosa sulla
   logica reale, non su una reimplementazione parallela;
3. valuta l'eleggibilità con `evaluate_eligibility` contro i criteri REALI
   di `config/backtesting.yaml` e la persiste (`EligibilityRepository`) — è
   quello che poi `run_cycle` legge per decidere se un ordine può passare
   al live tramite `execution.gate.LiveTradingGate`.

Resiliente per simbolo, come il ciclo di trading: un simbolo con dati
insufficienti o una fonte dati che fallisce viene loggato e saltato, il job
continua con gli altri.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import pandas as pd
import yaml

from config.settings import ASSETS_PATH
from trading_system.backtesting import BacktestEngine, BacktestingConfig, EligibilityRepository, evaluate_eligibility
from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.common.logging_config import get_logger
from trading_system.data_ingestion import CryptoCCXTSource, EquityYFinanceSource, MarketDataRepository
from trading_system.data_ingestion.storage import MarketBarORM

logger = get_logger(__name__)

_ASSET_CLASS_SECTIONS = ((AssetClass.EQUITY, "equity"), (AssetClass.ETF, "etf"), (AssetClass.CRYPTO, "crypto"))


@dataclass
class EligibilityRefreshReport:
    """Esito di un refresh — prodotto sempre, anche se qualche simbolo è stato saltato."""

    started_at: datetime
    finished_at: datetime
    symbols_evaluated: list[str] = field(default_factory=list)
    symbols_approved: list[str] = field(default_factory=list)
    symbols_rejected: list[str] = field(default_factory=list)
    symbols_skipped: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def load_watchlist() -> dict:
    with open(ASSETS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _bars_to_dataframe(rows: list[MarketBarORM]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    return pd.DataFrame(
        [
            {"timestamp": r.timestamp, "open": r.open, "high": r.high, "low": r.low, "close": r.close, "volume": r.volume}
            for r in rows
        ]
    ).sort_values("timestamp")


def _fetch_long_history(data_repo: MarketDataRepository, watchlist: dict, lookback_days: int) -> list[str]:
    """Estende lo storico all'indietro fino a `lookback_days`. Upsert idempotente:
    non duplica né tocca le barre recenti già mantenute fresche dal ciclo quotidiano."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    skipped: list[str] = []

    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)
    for item in watchlist.get("equity", []):
        symbol = item["symbol"]
        try:
            data_repo.upsert_bars(equity_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1))
        except DataSourceError as exc:
            logger.warning("Storico lungo non disponibile per %s (equity), salto: %s", symbol, exc)
            skipped.append(symbol)

    etf_source = EquityYFinanceSource(asset_class=AssetClass.ETF)
    for item in watchlist.get("etf", []):
        symbol = item["symbol"]
        try:
            data_repo.upsert_bars(etf_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1))
        except DataSourceError as exc:
            logger.warning("Storico lungo non disponibile per %s (etf), salto: %s", symbol, exc)
            skipped.append(symbol)

    by_exchange: dict[str, list[str]] = {}
    for item in watchlist.get("crypto", []):
        by_exchange.setdefault(item.get("exchange", "kraken"), []).append(item["symbol"])
    for exchange_id, symbols in by_exchange.items():
        crypto_source = CryptoCCXTSource(exchange_id=exchange_id)
        for symbol in symbols:
            try:
                data_repo.upsert_bars(crypto_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1))
            except DataSourceError as exc:
                logger.warning("Storico lungo non disponibile per %s su %s, salto: %s", symbol, exchange_id, exc)
                skipped.append(symbol)

    return skipped


def refresh_eligibility(
    data_repo: MarketDataRepository,
    eligibility_repo: EligibilityRepository,
    backtest_engine: BacktestEngine,
    backtesting_config: BacktestingConfig,
    lookback_days: int = 730,
) -> EligibilityRefreshReport:
    """Ricalcola e persiste l'eleggibilità al live per ogni simbolo della watchlist.

    Mai un'eccezione per un problema isolato su un simbolo: loggato,
    saltato, si continua con gli altri.
    """
    started_at = datetime.now(timezone.utc)
    report = EligibilityRefreshReport(started_at=started_at, finished_at=started_at)

    watchlist = load_watchlist()
    report.symbols_skipped.extend(_fetch_long_history(data_repo, watchlist, lookback_days))

    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)

    for asset_class, section in _ASSET_CLASS_SECTIONS:
        for item in watchlist.get(section, []):
            symbol = item["symbol"]
            if symbol in report.symbols_skipped:
                continue
            try:
                bars = _bars_to_dataframe(data_repo.get_bars(symbol, asset_class, Timeframe.DAY_1))
                fundamentals = None
                if asset_class == AssetClass.EQUITY:
                    try:
                        fundamentals = equity_source.get_fundamentals(symbol)
                    except DataSourceError as exc:
                        logger.warning("Fondamentali non disponibili per %s: %s", symbol, exc)

                run = backtest_engine.run(symbol, asset_class, bars, fundamentals=fundamentals)
            except ValueError as exc:
                logger.warning("Backtest non eseguibile per %s: %s", symbol, exc)
                report.symbols_skipped.append(symbol)
                continue
            except Exception as exc:  # noqa: BLE001 — un job non presidiato non deve fermarsi per un simbolo
                logger.exception("Errore imprevisto valutando l'eleggibilità di %s: salto e continuo.", symbol)
                report.symbols_skipped.append(symbol)
                report.errors.append(f"{symbol}: {exc}")
                continue

            eligibility = evaluate_eligibility(run.result, backtesting_config.eligibility)
            eligibility_repo.save(eligibility)
            report.symbols_evaluated.append(symbol)
            (report.symbols_approved if eligibility.approved else report.symbols_rejected).append(symbol)

    report.finished_at = datetime.now(timezone.utc)
    logger.info(
        "Refresh eleggibilità completato | valutati=%d idonei=%d non_idonei=%d saltati=%d durata=%s",
        len(report.symbols_evaluated), len(report.symbols_approved), len(report.symbols_rejected),
        len(report.symbols_skipped), report.finished_at - report.started_at,
    )
    return report
