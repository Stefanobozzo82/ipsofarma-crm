"""Composition root per gli entrypoint operativi reali (`scripts/run_scheduler.py`,
`scripts/run_cycle_once.py`, `scripts/refresh_eligibility.py`): costruisce gli
stack di produzione (repository, manager, config) dalle impostazioni/config
reali del progetto.

Esiste per evitare di duplicare la stessa sequenza di costruzione tra i vari
entrypoint: tutti devono comportarsi in modo identico, in particolare sul
principio "fail loud" — nessun fallback a limiti di rischio/portafoglio di
esempio, a differenza degli script demo in `scripts/*_sample_*.py`.
"""

from __future__ import annotations

from dataclasses import dataclass

from config.settings import get_settings
from trading_system.backtesting import (
    BacktestEngine,
    BacktestingConfig,
    EligibilityRepository,
    load_backtesting_config,
)
from trading_system.backtesting.storage import create_sqlite_engine as create_eligibility_engine
from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.data_ingestion import MarketDataRepository
from trading_system.data_ingestion.storage import create_sqlite_engine as create_data_engine
from trading_system.execution import ExecutionConfig, ExecutionManager, ExecutionRepository, load_execution_config
from trading_system.execution.storage import create_sqlite_engine as create_execution_engine
from trading_system.orchestration.config_loader import SchedulerConfig, load_scheduler_config
from trading_system.orchestration.cycle import CycleReport, run_cycle
from trading_system.orchestration.eligibility_cycle import EligibilityRefreshReport, refresh_eligibility
from trading_system.portfolio import PortfolioAllocator, load_portfolio_config
from trading_system.risk_management import RiskManager, load_risk_limits
from trading_system.strategy_engine import StrategyEngine

#: Storico scaricato dal job di refresh eleggibilità (modulo 5), abbastanza
#: lungo da superare `config/backtesting.yaml: eligibility.min_trades` sulle
#: strategie attuali. Non configurabile da file: è un parametro tecnico del
#: job, non una decisione di rischio.
_ELIGIBILITY_LOOKBACK_DAYS = 730


@dataclass
class Pipeline:
    """Stack di produzione per il ciclo di trading, già costruito."""

    data_repo: MarketDataRepository
    execution_manager: ExecutionManager
    risk_manager: RiskManager
    portfolio_allocator: PortfolioAllocator
    strategy_engine: StrategyEngine
    eligibility_repo: EligibilityRepository
    execution_config: ExecutionConfig
    scheduler_config: SchedulerConfig

    def run_once(self) -> CycleReport:
        return run_cycle(
            self.data_repo, self.execution_manager, self.risk_manager, self.portfolio_allocator,
            self.strategy_engine, eligibility_repo=self.eligibility_repo,
            lookback_days=self.scheduler_config.data_lookback_days,
        )


def build_pipeline() -> Pipeline:
    """Costruisce il `Pipeline` reale. Solleva `ConfigurationError` se
    risk_limits/portafoglio/execution non sono compilati o validi — mai un
    fallback silenzioso, questo è codice operativo, non una demo."""
    settings = get_settings()

    data_repo = MarketDataRepository(create_data_engine(settings.resolved_database_url))
    execution_repo = ExecutionRepository(create_execution_engine(settings.resolved_database_url))
    eligibility_repo = EligibilityRepository(create_eligibility_engine(settings.resolved_database_url))

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
        eligibility_repo=eligibility_repo,
        execution_config=execution_config,
        scheduler_config=scheduler_config,
    )


@dataclass
class EligibilityPipeline:
    """Stack di produzione per il job di refresh eleggibilità, già costruito."""

    data_repo: MarketDataRepository
    eligibility_repo: EligibilityRepository
    backtest_engine: BacktestEngine
    backtesting_config: BacktestingConfig

    def run_once(self) -> EligibilityRefreshReport:
        return refresh_eligibility(
            self.data_repo, self.eligibility_repo, self.backtest_engine, self.backtesting_config,
            lookback_days=_ELIGIBILITY_LOOKBACK_DAYS,
        )


def build_eligibility_pipeline() -> EligibilityPipeline:
    """Costruisce l'`EligibilityPipeline` reale. Usa SEMPRE i limiti di rischio
    reali (mai di esempio): un'eleggibilità calcolata con limiti finti non deve
    mai poter autorizzare denaro vero. Solleva `ConfigurationError` se
    risk_limits/backtesting non sono compilati o validi."""
    settings = get_settings()

    data_repo = MarketDataRepository(create_data_engine(settings.resolved_database_url))
    eligibility_repo = EligibilityRepository(create_eligibility_engine(settings.resolved_database_url))

    risk_limits = load_risk_limits()
    risk_manager = RiskManager(config=risk_limits)
    strategy_engine = StrategyEngine()
    backtesting_config = load_backtesting_config()
    backtest_engine = BacktestEngine(backtesting_config, strategy_engine, risk_manager)

    return EligibilityPipeline(
        data_repo=data_repo,
        eligibility_repo=eligibility_repo,
        backtest_engine=backtest_engine,
        backtesting_config=backtesting_config,
    )
