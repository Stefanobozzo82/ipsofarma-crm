"""Orchestratore dell'execution layer: da `AllocationDecision` a `Order`.

Paper trading di default, sempre. Se `config/execution.yaml: mode: live`,
ogni ordine passa comunque per `LiveTradingGate` (backtest positivo e non
scaduto, più conferma esplicita o periodo di validazione superato): se il
gate non approva, o se il broker live non è disponibile (credenziali
mancanti), l'ordine viene eseguito in paper — mai rifiutato in silenzio,
mai eseguito live senza autorizzazione. Ogni `Order`, paper o live, viene
registrato nello stesso storico (`ExecutionRepository.record_order`), unico
punto di scrittura per una tracciabilità unificata.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from config.settings import Settings, get_settings
from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide, OrderStatus, SignalAction
from trading_system.common.exceptions import ConfigurationError
from trading_system.common.logging_config import get_logger
from trading_system.common.models import AllocationDecision, BacktestEligibility, Order
from trading_system.execution.broker_base import ExecutionBroker
from trading_system.execution.config_loader import ExecutionConfig
from trading_system.execution.gate import LiveTradingGate
from trading_system.execution.paper_broker import PaperBroker
from trading_system.execution.storage import ExecutionRepository

logger = get_logger(__name__)

_ACTION_TO_SIDE = {SignalAction.BUY: OrderSide.BUY, SignalAction.SELL: OrderSide.SELL}


class ExecutionManager:
    """Trasforma una `AllocationDecision` approvata in un `Order`, in paper o (se autorizzato) in live."""

    def __init__(
        self,
        config: ExecutionConfig,
        repository: ExecutionRepository,
        price_provider: Callable[[str, AssetClass], float],
        settings: Settings | None = None,
        paper_broker: PaperBroker | None = None,
        live_broker_factory: Callable[[AssetClass], ExecutionBroker] | None = None,
    ) -> None:
        self._config = config
        self._repository = repository
        self._price_provider = price_provider
        self._settings = settings or get_settings()
        self._live_broker_factory = live_broker_factory
        self._paper_broker = paper_broker or PaperBroker(
            repository, price_provider, config.paper.initial_cash, config.paper.commission_pct,
        )
        self._gate = LiveTradingGate(config.live_gate, repository)

    @property
    def paper_broker(self) -> PaperBroker:
        """Il broker paper interno — utile per interrogare cassa/posizioni (es. dashboard, modulo 7)."""
        return self._paper_broker

    def execute(
        self,
        decision: AllocationDecision,
        eligibility: BacktestEligibility | None = None,
        explicit_confirmation: bool = False,
    ) -> Order:
        """Esegue (o rifiuta) una `AllocationDecision`, sempre motivato e sempre tracciato."""
        now = datetime.now(timezone.utc)

        if not decision.approved or decision.quantity <= 0.0 or decision.action == SignalAction.HOLD:
            side = _ACTION_TO_SIDE.get(decision.action, OrderSide.BUY)
            order = Order(
                symbol=decision.symbol, asset_class=decision.asset_class, side=side, quantity=0.0,
                mode=ExecutionMode.PAPER, broker="none", strategy_name=decision.strategy_name,
                status=OrderStatus.REJECTED,
                reason=f"Nessun ordine da eseguire (AllocationDecision non idonea): {decision.reason}",
                created_at=now,
            )
            self._repository.record_order(order)
            return order

        side = _ACTION_TO_SIDE[decision.action]
        broker: ExecutionBroker = self._paper_broker
        reason = decision.reason

        if self._config.mode == "live":
            broker, reason = self._resolve_live_or_fallback(decision, eligibility, explicit_confirmation, reason)

        order = broker.submit_order(
            decision.symbol, decision.asset_class, side, decision.quantity, decision.strategy_name, reason,
        )
        self._repository.record_order(order)
        return order

    def _resolve_live_or_fallback(
        self,
        decision: AllocationDecision,
        eligibility: BacktestEligibility | None,
        explicit_confirmation: bool,
        reason: str,
    ) -> tuple[ExecutionBroker, str]:
        """Ritorna (broker, reason aggiornato). Ripiega sempre su paper se il live non è autorizzabile."""
        if eligibility is None:
            return self._paper_broker, (
                f"{reason} [modalità live richiesta ma nessun BacktestEligibility fornito: eseguito in paper]"
            )

        gate_decision = self._gate.check(
            decision.symbol, decision.strategy_name, eligibility,
            explicit_confirmation, self._settings.live_trading_enabled,
        )
        if not gate_decision.approved_for_live:
            return self._paper_broker, f"{reason} [live non autorizzato: {gate_decision.reason} — eseguito in paper]"

        try:
            live_broker = self._build_live_broker(decision.asset_class)
        except ConfigurationError as exc:
            logger.warning("Live autorizzato ma broker non disponibile per %s: %s", decision.symbol, exc)
            return self._paper_broker, f"{reason} [live autorizzato ma broker non disponibile ({exc}): eseguito in paper]"

        return live_broker, f"{reason} [eseguito in live: {gate_decision.reason}]"

    def _build_live_broker(self, asset_class: AssetClass) -> ExecutionBroker:
        if self._live_broker_factory is not None:
            return self._live_broker_factory(asset_class)

        if asset_class in (AssetClass.EQUITY, AssetClass.ETF):
            broker_id = (
                self._config.live_brokers.equity if asset_class == AssetClass.EQUITY
                else self._config.live_brokers.etf
            )
            if broker_id != "alpaca":
                raise ConfigurationError(f"Broker live non supportato per {asset_class.value}: '{broker_id}'.")
            from trading_system.execution.live.alpaca_broker import AlpacaBroker

            return AlpacaBroker(
                self._settings.alpaca_api_key, self._settings.alpaca_api_secret, self._settings.alpaca_base_url,
            )

        broker_id = self._config.live_brokers.crypto
        api_key, api_secret = self._settings.crypto_credentials(broker_id)
        from trading_system.execution.live.ccxt_broker import CCXTBroker

        return CCXTBroker(broker_id, api_key, api_secret)
