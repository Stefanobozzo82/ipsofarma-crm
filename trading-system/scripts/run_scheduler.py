#!/usr/bin/env python3
"""Modulo 8 — avvia il ciclo autonomo (dati -> segnali -> rischio ->
allocazione -> esecuzione) e lo fa girare da solo, alla cadenza configurata
in `config/scheduler.yaml`, finché il processo non viene fermato.

A differenza degli script demo in questa cartella, NON usa mai limiti di
rischio di esempio: se `config/risk_limits.yaml` o `config/portfolio.yaml`
non sono compilati/validi, si ferma con un errore esplicito invece di
operare con una configurazione fittizia — è l'entrypoint operativo reale,
non una demo.

Esegue sempre nei limiti di `config/execution.yaml`: con `mode: paper`
(il default), ogni ciclo opera esclusivamente sul conto paper persistito,
mai su un broker/exchange reale.

Uso:
    python scripts/run_scheduler.py
    # Ctrl+C, o SIGTERM (es. `systemctl stop`), per fermarlo in modo pulito.

Un primo ciclo viene eseguito subito all'avvio (così il sistema è operativo
da subito, non solo alla prossima occorrenza pianificata), poi lo scheduler
prosegue secondo la cadenza configurata.
"""

from __future__ import annotations

import signal
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from config.settings import LOGS_DIR, get_settings
from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.common.logging_config import configure_logging, get_logger
from trading_system.data_ingestion import MarketDataRepository
from trading_system.data_ingestion.storage import create_sqlite_engine as create_data_engine
from trading_system.execution import ExecutionManager, ExecutionRepository, load_execution_config
from trading_system.execution.storage import create_sqlite_engine as create_execution_engine
from trading_system.orchestration import CycleReport, build_scheduler, load_scheduler_config, run_cycle
from trading_system.portfolio import PortfolioAllocator, load_portfolio_config
from trading_system.risk_management import RiskManager, load_risk_limits
from trading_system.strategy_engine import StrategyEngine

logger = get_logger(__name__)


def _build_price_provider(data_repo: MarketDataRepository):
    def price_provider(symbol: str, asset_class: AssetClass) -> float:
        bars = data_repo.get_bars(symbol, asset_class, Timeframe.DAY_1)
        if not bars:
            raise DataSourceError(f"Nessun prezzo storicizzato per {symbol}")
        return float(bars[-1].close)

    return price_provider


def _run_and_log(cycle_fn) -> CycleReport | None:
    try:
        report = cycle_fn()
    except Exception:
        logger.exception("Ciclo autonomo fallito per un errore non gestito.")
        return None
    print(
        f"Ciclo completato — elaborati={report.symbols_processed} saltati={len(report.symbols_skipped)} "
        f"ordini_filled={report.orders_filled} ordini_rejected={report.orders_rejected} "
        f"cassa={report.cash_after:.2f} equity_totale={report.total_equity_after:.2f}"
    )
    return report


def main() -> None:
    settings = get_settings()
    configure_logging(log_level=settings.log_level, logs_dir=LOGS_DIR)

    data_repo = MarketDataRepository(create_data_engine(settings.resolved_database_url))
    execution_repo = ExecutionRepository(create_execution_engine(settings.resolved_database_url))

    # Fail loud: nessun fallback a limiti/config di esempio in questo entrypoint operativo.
    risk_limits = load_risk_limits()
    risk_manager = RiskManager(config=risk_limits)
    portfolio_allocator = PortfolioAllocator(load_portfolio_config(risk_limits))
    execution_config = load_execution_config()
    execution_manager = ExecutionManager(execution_config, execution_repo, _build_price_provider(data_repo))
    strategy_engine = StrategyEngine()
    scheduler_config = load_scheduler_config()

    def cycle_fn() -> CycleReport:
        return run_cycle(
            data_repo, execution_manager, risk_manager, portfolio_allocator, strategy_engine,
            lookback_days=scheduler_config.data_lookback_days,
        )

    print(f"Modalità execution: '{execution_config.mode}' (paper è sempre il default sicuro)")
    print(
        f"Scheduler: cadence='{scheduler_config.cadence}' "
        f"({scheduler_config.run_at_utc or f'{scheduler_config.interval_hours}h'}), "
        f"lookback dati={scheduler_config.data_lookback_days} giorni\n"
    )

    scheduler = build_scheduler(cycle_fn, scheduler_config)
    scheduler.start()

    print("Eseguo un primo ciclo immediato all'avvio...")
    _run_and_log(cycle_fn)
    print("\nScheduler avviato — in ascolto secondo la cadenza pianificata. Ctrl+C per fermare.\n")

    stop_event = threading.Event()

    def _handle_stop(signum, frame) -> None:
        logger.info("Segnale di arresto ricevuto (%s): fermo lo scheduler.", signum)
        stop_event.set()

    signal.signal(signal.SIGINT, _handle_stop)
    signal.signal(signal.SIGTERM, _handle_stop)

    while not stop_event.is_set():
        stop_event.wait(60)

    scheduler.shutdown(wait=True)
    print("Scheduler fermato.")


if __name__ == "__main__":
    main()
