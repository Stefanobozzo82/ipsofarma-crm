"""Composition root per gli entrypoint operativi reali (`scripts/run_scheduler.py`,
`scripts/run_cycle_once.py`): costruisce lo stack di produzione (repository,
manager, config) dalle impostazioni/config reali del progetto.

Esiste per evitare di duplicare la stessa sequenza di costruzione tra il
demone always-on e il run singolo pensato per uno scheduler esterno (es.
GitHub Actions): entrambi devono comportarsi in modo identico, in
particolare sul principio "fail loud" — nessun fallback a limiti di
rischio/portafoglio di esempio, a differenza degli script demo in
`scripts/*_sample_*.py`.
"""

from __future__ import annotations

from dataclasses import dataclass

from config.settings import get_settings
from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.data_ingestion import MarketDataRepository
from trading_system.data_ingestion.storage import create_sqlite_engine as create_data_engine
from trading_system.execution import ExecutionConfig, ExecutionManager, ExecutionRepository, load_execution_config
from trading_system.execution.storage import create_sqlite_engine as create_execution_engine
from trading_system.orchestration.config_loader import SchedulerConfig, load_scheduler_config
from trading_system.orchestration.cycle import CycleReport, run_cycle
from trading_system.portfolio import PortfolioAllocator, load_portfolio_config
from trading_system.risk_management import RiskManager, load_risk_limits
from trading_system.strategy_engine import StrategyEngine


@dataclass
class Pipeline:
    """Stack di produzione già costruito, pronto a eseguire cicli."""

    data_repo: MarketDataRepository
    execution_manager: ExecutionManager
    risk_manager: RiskManager
    portfolio_allocator: PortfolioAllocator
    strategy_engine: StrategyEngine
    execution_config: ExecutionConfig
    scheduler_config: SchedulerConfig

    def run_once(self) -> CycleReport:
        return run_cycle(
            self.data_repo, self.execution_manager, self.risk_manager, self.portfolio_allocator,
            self.strategy_engine, lookback_days=self.scheduler_config.data_lookback_days,
        )


def build_pipeline() -> Pipeline:
    """Costruisce il `Pipeline` reale. Solleva `ConfigurationError` se
    risk_limits/portfolio/execution non sono compilati o validi — mai un
    fallback silenzioso, questo è codice operativo, non una demo."""
    settings = get_settings()

    data_repo = MarketDataRepository(create_data_engine(settings.resolved_database_url))
    execution_repo = ExecutionRepository(create_execution_engine(settings.resolved_database_url))

    risk_limits = load_risk_limits()
    risk_manager = RiskManager(config=risk_limits)
    portfolio_allocator = PortfolioAllocator(load_portfolio_config(risk_limits))
    execution_config = load_execution_config()

    def price_provider(symbol: str, asset_class: AssetClass) -> float:
        bars = data_repo.get_bars(symbol, asset_class, Timeframe.DAY_1)
        if not bars:
            raise DataSourceError(f"Nessun prezzo storicizzato per {symbol}")
        return float(bars[-1].close)

    execution_manager = ExecutionManager(execution_config, execution_repo, price_provider)
    strategy_engine = StrategyEngine()
    scheduler_config = load_scheduler_config()

    return Pipeline(
        data_repo=data_repo,
        execution_manager=execution_manager,
        risk_manager=risk_manager,
        portfolio_allocator=portfolio_allocator,
        strategy_engine=strategy_engine,
        execution_config=execution_config,
        scheduler_config=scheduler_config,
    )
