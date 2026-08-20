#!/usr/bin/env python3
"""Modulo 8 — avvia il ciclo autonomo (dati -> segnali -> rischio ->
allocazione -> esecuzione) e lo fa girare da solo, alla cadenza configurata
in `config/scheduler.yaml`, finché il processo non viene fermato.

Pensato per una macchina sempre accesa (VM, container long-running): se
invece vuoi affidare la cadenza a uno scheduler esterno che lancia un
processo alla volta e lo lascia terminare (es. GitHub Actions `schedule:`),
usa `scripts/run_cycle_once.py` — stesso stack (`orchestration.bootstrap`),
stesso principio "fail loud", nessun demone da tenere vivo.

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
from trading_system.common.logging_config import configure_logging, get_logger
from trading_system.orchestration import CycleReport, build_pipeline, build_scheduler

logger = get_logger(__name__)


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

    # Fail loud: nessun fallback a limiti/config di esempio in questo entrypoint operativo.
    pipeline = build_pipeline()

    print(f"Modalità execution: '{pipeline.execution_config.mode}' (paper è sempre il default sicuro)")
    scheduler_config = pipeline.scheduler_config
    print(
        f"Scheduler: cadence='{scheduler_config.cadence}' "
        f"({scheduler_config.run_at_utc or f'{scheduler_config.interval_hours}h'}), "
        f"lookback dati={scheduler_config.data_lookback_days} giorni\n"
    )

    scheduler = build_scheduler(pipeline.run_once, scheduler_config)
    scheduler.start()

    print("Eseguo un primo ciclo immediato all'avvio...")
    _run_and_log(pipeline.run_once)
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
