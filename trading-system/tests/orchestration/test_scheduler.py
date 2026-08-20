"""Test della costruzione dello scheduler (modulo 8). Nessuno scheduler viene
avviato davvero: `build_scheduler` è testata come pura costruzione."""

from __future__ import annotations

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from trading_system.orchestration.config_loader import SchedulerConfig
from trading_system.orchestration.scheduler import JOB_ID, _run_safely, build_scheduler


def _daily_config(**overrides) -> SchedulerConfig:
    data = {"enabled": True, "cadence": "daily", "run_at_utc": "06:00", "data_lookback_days": 30}
    data.update(overrides)
    return SchedulerConfig(**data)


def test_daily_cadence_schedules_a_cron_trigger():
    scheduler = build_scheduler(lambda: None, _daily_config())

    job = scheduler.get_job(JOB_ID)

    assert job is not None
    assert isinstance(job.trigger, CronTrigger)


def test_interval_hours_cadence_schedules_an_interval_trigger():
    config = _daily_config(cadence="interval_hours", run_at_utc=None, interval_hours=4)

    scheduler = build_scheduler(lambda: None, config)

    job = scheduler.get_job(JOB_ID)
    assert job is not None
    assert isinstance(job.trigger, IntervalTrigger)


def test_disabled_config_schedules_no_job():
    scheduler = build_scheduler(lambda: None, _daily_config(enabled=False))

    assert scheduler.get_job(JOB_ID) is None


def test_run_safely_swallows_exceptions_from_the_cycle():
    def _boom() -> None:
        raise RuntimeError("errore imprevisto (test)")

    # Non deve sollevare: lo scheduler deve restare vivo e riprovare al giro successivo.
    _run_safely(_boom)
