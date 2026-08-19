"""Configurazione del logging applicativo.

Obiettivo: log dettagliati e strutturati su tutti i moduli, in particolare
sui moduli critici (risk management, execution, portfolio allocator) dove
ogni decisione deve restare tracciabile. Ogni logger applicativo scrive sia
su console che su file rotante in `logs/`.
"""

from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path

_CONFIGURED = False

_LOG_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
)


def configure_logging(log_level: str = "INFO", logs_dir: Path | None = None) -> None:
    """Configura il root logger dell'applicazione. Idempotente."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    root = logging.getLogger("trading_system")
    root.setLevel(log_level.upper())
    formatter = logging.Formatter(_LOG_FORMAT)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root.addHandler(console_handler)

    if logs_dir is not None:
        logs_dir.mkdir(parents=True, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            logs_dir / "trading_system.log",
            maxBytes=5 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Restituisce un logger figlio del namespace `trading_system`.

    Uso tipico: `get_logger(__name__)` in ogni modulo.
    """
    if not _CONFIGURED:
        configure_logging()
    return logging.getLogger(f"trading_system.{name}" if not name.startswith("trading_system") else name)
