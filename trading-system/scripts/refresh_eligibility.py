#!/usr/bin/env python3
"""Modulo 8 — ricalcola e persiste l'eleggibilità al trading live (modulo 5)
per ogni simbolo/strategia della watchlist, poi termina.

Pensato per una cadenza bassa (settimanale — vedi
`.github/workflows/eligibility-refresh.yml`), separata da quella del ciclo
di trading quotidiano (`scripts/run_cycle_once.py`/`run_scheduler.py`): un
backtest su uno storico lungo è costoso da rifare ad ogni ciclo.

Fail loud, come gli altri entrypoint operativi reali: nessun fallback a
limiti di rischio di esempio. Usa SEMPRE i limiti reali, perché
un'eleggibilità calcolata con limiti finti non deve mai poter autorizzare
denaro vero. Esce con codice diverso da zero se qualcosa va storto, così un
job CI esterno lo rileva come fallito.

Uso:
    python scripts/refresh_eligibility.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from config.settings import LOGS_DIR, get_settings
from trading_system.common.logging_config import configure_logging, get_logger
from trading_system.orchestration import build_eligibility_pipeline

logger = get_logger(__name__)


def main() -> int:
    settings = get_settings()
    configure_logging(log_level=settings.log_level, logs_dir=LOGS_DIR)

    pipeline = build_eligibility_pipeline()

    try:
        report = pipeline.run_once()
    except Exception:
        logger.exception("Refresh eleggibilità fallito per un errore non gestito.")
        return 1

    print(
        f"Refresh completato — valutati={len(report.symbols_evaluated)} "
        f"idonei={len(report.symbols_approved)} non_idonei={len(report.symbols_rejected)} "
        f"saltati={len(report.symbols_skipped)}"
    )
    if report.symbols_approved:
        print(f"Idonei al live: {', '.join(report.symbols_approved)}")
    if report.symbols_rejected:
        print(f"Non idonei: {', '.join(report.symbols_rejected)}")
    if report.symbols_skipped:
        print(f"Saltati (dati insufficienti/fonte non disponibile): {', '.join(report.symbols_skipped)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
