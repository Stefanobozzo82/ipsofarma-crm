"""Modulo 8 — Orchestrazione: fa girare in autonomia (senza intervento umano
per ogni ciclo) l'intera pipeline dei moduli 1-6, alla cadenza configurata in
`config/scheduler.yaml`.

Non introduce nuova logica di trading: orchestra i moduli già costruiti e
testati (data ingestion, strategy engine, risk management, portfolio
allocator, execution, backtesting) con responsabilità proprie di job non
presidiati — resilienza per singolo simbolo (`cycle.run_cycle`,
`eligibility_cycle.refresh_eligibility`) e pianificazione
(`scheduler.build_scheduler`, APScheduler).

Esegue sempre nei limiti di `config/execution.yaml` (`mode: paper` è
l'unico default sicuro) e `config/risk_limits.yaml`: l'autonomia riguarda
QUANDO gira il ciclo, mai un bypass dei controlli di rischio. L'unico
percorso automatico verso il live è il periodo di validazione in paper
trading di `execution.gate.LiveTradingGate`, autorizzato da un'eleggibilità
(modulo 5) calcolata da `eligibility_cycle.refresh_eligibility` — mai una
conferma esplicita, che un ciclo non presidiato non può fornire.
"""

from trading_system.orchestration.bootstrap import EligibilityPipeline, Pipeline, build_eligibility_pipeline, build_pipeline
from trading_system.orchestration.config_loader import SchedulerConfig, load_scheduler_config
from trading_system.orchestration.cycle import CycleReport, run_cycle
from trading_system.orchestration.eligibility_cycle import EligibilityRefreshReport, refresh_eligibility
from trading_system.orchestration.scheduler import build_scheduler

__all__ = [
    "SchedulerConfig",
    "load_scheduler_config",
    "CycleReport",
    "run_cycle",
    "EligibilityRefreshReport",
    "refresh_eligibility",
    "build_scheduler",
    "Pipeline",
    "build_pipeline",
    "EligibilityPipeline",
    "build_eligibility_pipeline",
]
