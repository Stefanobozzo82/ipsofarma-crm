#!/usr/bin/env python3
"""Modulo 8 — esegue UN SOLO ciclo autonomo (dati -> segnali -> rischio ->
allocazione -> esecuzione) e termina.

Pensato per essere invocato da uno scheduler ESTERNO che lancia un processo
alla volta e lo lascia terminare — tipicamente un cron di GitHub Actions
(`.github/workflows/trading-cycle.yml`), a differenza di
`scripts/run_scheduler.py` che resta in esecuzione e pianifica i cicli da
solo (pensato per una macchina sempre accesa). Stesso stack
(`orchestration.bootstrap.build_pipeline`), stesso comportamento: nessun
fallback a limiti di rischio/portafoglio di esempio, esce con codice
diverso da zero se qualcosa va storto, così un job CI esterno lo rileva
come fallito invece di segnare silenziosamente "successo".

Lo stato del conto paper (`data/trading_system.db`) non viene gestito da
questo script: chi lo invoca (il workflow CI, o te a mano) è responsabile
di ripristinarlo prima e persisterlo dopo, se vuoi che il conto sopravviva
tra un run e l'altro — vedi la sezione "Modulo 8" del README per come lo fa
il workflow GitHub Actions fornito.

Uso:
    python scripts/run_cycle_once.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from config.settings import LOGS_DIR, get_settings
from trading_system.common.logging_config import configure_logging, get_logger
from trading_system.orchestration import build_pipeline

logger = get_logger(__name__)


def main() -> int:
    settings = get_settings()
    configure_logging(log_level=settings.log_level, logs_dir=LOGS_DIR)

    # Fail loud: nessun fallback a limiti/config di esempio in questo entrypoint operativo.
    pipeline = build_pipeline()
    print(f"Modalità execution: '{pipeline.execution_config.mode}' (paper è sempre il default sicuro)")

    try:
        report = pipeline.run_once()
    except Exception:
        logger.exception("Ciclo fallito per un errore non gestito.")
        return 1

    print(
        f"Ciclo completato — elaborati={report.symbols_processed} saltati={len(report.symbols_skipped)} "
        f"ordini_filled={report.orders_filled} ordini_rejected={report.orders_rejected} "
        f"cassa={report.cash_after:.2f} equity_totale={report.total_equity_after:.2f}"
    )
    if report.symbols_skipped:
        print(f"Simboli saltati in questo ciclo: {', '.join(report.symbols_skipped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
