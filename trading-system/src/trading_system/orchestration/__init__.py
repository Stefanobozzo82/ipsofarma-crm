"""Modulo 8 — Orchestrazione: fa girare in autonomia (senza intervento umano
per ogni ciclo) l'intera pipeline dei moduli 1-6, alla cadenza configurata in
`config/scheduler.yaml`.

Non introduce nuova logica di trading: orchestra i moduli già costruiti e
testati (data ingestion, strategy engine, risk management, portfolio
allocator, execution) con due responsabilità proprie di un job non
presidiato — resilienza per singolo simbolo (`cycle.run_cycle`) e
pianificazione (`scheduler.build_scheduler`, APScheduler).

Esegue sempre nei limiti di `config/execution.yaml` (`mode: paper` è
l'unico default sicuro) e `config/risk_limits.yaml`: l'autonomia riguarda
QUANDO gira il ciclo, mai un bypass dei controlli di rischio o del gate
verso il live, che restano quelli dei moduli 3 e 6.
"""

from trading_system.orchestration.config_loader import SchedulerConfig, load_scheduler_config
from trading_system.orchestration.cycle import CycleReport, run_cycle
from trading_system.orchestration.scheduler import build_scheduler

__all__ = [
    "SchedulerConfig",
    "load_scheduler_config",
    "CycleReport",
    "run_cycle",
    "build_scheduler",
]
