"""Modulo 6 — Execution layer.

Paper trading di default, sempre (`config/execution.yaml: mode: paper`).
L'esecuzione con denaro reale vive isolata in `execution.live` e passa
sempre per `LiveTradingGate`: backtest positivo e non scaduto (modulo 5) è
sempre obbligatorio, più almeno una tra conferma esplicita a runtime
(mai automatica) o un periodo di validazione in paper trading superato.
Se il live non è autorizzabile per qualunque motivo — gate non superato,
credenziali broker mancanti — l'ordine viene eseguito in paper, mai
rifiutato in silenzio e mai eseguito live senza autorizzazione.

`ExecutionManager` è il punto d'ingresso: trasforma una
`AllocationDecision` (modulo 4) in un `Order`, con broker/exchange diversi
per asset class (Alpaca per azioni/ETF, ccxt per crypto) e uno storico
unificato di ogni ordine (paper o live) per tracciabilità completa.
"""

from trading_system.execution.broker_base import ExecutionBroker
from trading_system.execution.config_loader import ExecutionConfig, LiveGateConfig, load_execution_config
from trading_system.execution.gate import GateDecision, LiveTradingGate
from trading_system.execution.manager import ExecutionManager
from trading_system.execution.paper_broker import PaperBroker
from trading_system.execution.storage import ExecutionRepository

__all__ = [
    "ExecutionBroker",
    "ExecutionConfig",
    "LiveGateConfig",
    "load_execution_config",
    "GateDecision",
    "LiveTradingGate",
    "ExecutionManager",
    "PaperBroker",
    "ExecutionRepository",
]
