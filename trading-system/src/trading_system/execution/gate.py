"""Gate per l'autorizzazione al trading live: da paper a denaro reale.

Per un dato simbolo/strategia, il passaggio al live richiede SEMPRE un
backtest positivo e non scaduto (modulo 5), più ALMENO UNA tra:

(a) conferma esplicita a runtime — mai automatica, mai letta da un file di
    configurazione, deve essere passata esplicitamente dal chiamante
    (dashboard, CLI) *e* `LIVE_TRADING_ENABLED=true` nell'ambiente;
(b) un periodo di validazione in paper trading superato — numero minimo di
    trade paper riempiti e giorni minimi dal primo, su quello stesso
    simbolo/strategia (`config/execution.yaml: live_gate`).

Nessuna delle due condizioni da sola basta se il backtest non è positivo o
è scaduto: quello resta sempre un prerequisito, non un'alternativa.
"""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel

from trading_system.common.logging_config import get_logger
from trading_system.common.models import BacktestEligibility
from trading_system.execution.config_loader import LiveGateConfig
from trading_system.execution.storage import ExecutionRepository

logger = get_logger(__name__)


class GateDecision(BaseModel):
    """Esito della valutazione del gate live, sempre motivato."""

    symbol: str
    strategy_name: str
    approved_for_live: bool
    reason: str
    checked_at: datetime


class LiveTradingGate:
    """Decide se un simbolo/strategia può passare dal paper al live trading."""

    def __init__(self, config: LiveGateConfig, repository: ExecutionRepository) -> None:
        self._config = config
        self._repository = repository

    def check(
        self,
        symbol: str,
        strategy_name: str,
        eligibility: BacktestEligibility,
        explicit_confirmation: bool,
        live_trading_enabled: bool,
    ) -> GateDecision:
        now = datetime.now(timezone.utc)

        if not eligibility.approved:
            return self._decision(symbol, strategy_name, False, f"Backtest non idoneo: {eligibility.reason}", now)

        backtest_age_days = (now - eligibility.evaluated_at).days
        if backtest_age_days > self._config.max_backtest_age_days:
            return self._decision(
                symbol, strategy_name, False,
                f"Backtest scaduto: valutato {backtest_age_days} giorni fa "
                f"(massimo {self._config.max_backtest_age_days}). Rilancia il backtest prima di riprovare.",
                now,
            )

        path_a_ok = explicit_confirmation and live_trading_enabled
        num_paper_trades, first_paper_trade_at = self._repository.get_validation_stats(symbol, strategy_name)
        days_in_paper = (now - first_paper_trade_at).days if first_paper_trade_at else 0
        path_b_ok = (
            num_paper_trades >= self._config.min_paper_trades
            and days_in_paper >= self._config.min_paper_trading_days
        )

        if not (path_a_ok or path_b_ok):
            reason = (
                f"Nessun percorso verso il live superato — "
                f"conferma esplicita: {'presente' if explicit_confirmation else 'assente'} "
                f"(LIVE_TRADING_ENABLED={'true' if live_trading_enabled else 'false'}); "
                f"validazione paper: {num_paper_trades}/{self._config.min_paper_trades} trade, "
                f"{days_in_paper}/{self._config.min_paper_trading_days} giorni dal primo trade."
            )
            return self._decision(symbol, strategy_name, False, reason, now)

        path_label = "conferma esplicita" if path_a_ok else "periodo di validazione paper superato"
        return self._decision(symbol, strategy_name, True, f"Live autorizzato via {path_label}.", now)

    def _decision(self, symbol: str, strategy_name: str, approved: bool, reason: str, now: datetime) -> GateDecision:
        logger.info(
            "Gate live | symbol=%s strategy=%s approved=%s reason=%s",
            symbol, strategy_name, approved, reason,
        )
        return GateDecision(
            symbol=symbol, strategy_name=strategy_name, approved_for_live=approved, reason=reason, checked_at=now,
        )
