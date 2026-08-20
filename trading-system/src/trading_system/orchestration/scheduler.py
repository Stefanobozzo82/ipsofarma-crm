"""Pianificazione del ciclo autonomo (modulo 8) via APScheduler.

Costruisce lo scheduler ma non lo avvia: l'avvio (e il blocco del processo)
è responsabilità del chiamante (`scripts/run_scheduler.py`), così questo
modulo resta testabile senza dover davvero far girare un job in background
nei test.
"""

from __future__ import annotations

from typing import Callable

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from trading_system.common.logging_config import get_logger
from trading_system.orchestration.config_loader import SchedulerConfig
from trading_system.orchestration.cycle import CycleReport

logger = get_logger(__name__)

JOB_ID = "autonomous_trading_cycle"


def _build_trigger(config: SchedulerConfig):
    if config.cadence == "daily":
        hour, minute = (int(part) for part in config.run_at_utc.split(":"))
        return CronTrigger(hour=hour, minute=minute, timezone="UTC")
    if config.cadence == "interval_hours":
        return IntervalTrigger(hours=config.interval_hours, timezone="UTC")
    raise ValueError(f"cadence non gestita: {config.cadence!r}")  # già validato da load_scheduler_config


def _run_safely(cycle_fn: Callable[[], CycleReport]) -> None:
    """Esegue un ciclo intercettando qualunque eccezione non gestita.

    `run_cycle` è già resiliente per singolo simbolo; questo è l'ultima
    rete di sicurezza per un fallimento a monte (es. database irraggiungibile):
    lo scheduler deve restare vivo e riprovare al giro successivo, non
    fermarsi silenziosamente.
    """
    try:
        cycle_fn()
    except Exception:
        logger.exception("Ciclo autonomo fallito per un errore non gestito: riprovo al prossimo giro pianificato.")


def build_scheduler(cycle_fn: Callable[[], CycleReport], config: SchedulerConfig) -> BackgroundScheduler:
    """Costruisce (senza avviare) uno scheduler con il ciclo autonomo pianificato secondo `config`."""
    scheduler = BackgroundScheduler(timezone="UTC")
    if config.enabled:
        trigger = _build_trigger(config)
        scheduler.add_job(_run_safely, trigger=trigger, args=[cycle_fn], id=JOB_ID, replace_existing=True)
        logger.info("Job autonomo pianificato | cadence=%s trigger=%s", config.cadence, trigger)
    else:
        logger.warning("config/scheduler.yaml: enabled=false — nessun job pianificato.")
    return scheduler
