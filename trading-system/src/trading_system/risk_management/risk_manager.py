"""Orchestratore del risk management: da `Signal` a `RiskDecision`.

Combina, nell'ordine, tutti i controlli del modulo:

1. i limiti di rischio devono essere compilati e abilitati
   (`config/risk_limits.yaml`, validato da `config_loader.load_risk_limits`);
2. l'asset class del segnale deve essere abilitata al trading;
3. un segnale HOLD non produce mai un ordine;
4. il filtro di volatilità (`volatility_filter.check_volatility`) deve
   passare — altrimenti l'asset è escluso a prescindere dal segnale;
5. il position sizing (`position_sizing.PositionSizer`) deve produrre una
   quantità positiva entro i limiti per strumento e per asset class;
6. viene calcolato lo stop-loss (`stop_loss.compute_stop_loss_price`).

Nessuno di questi passaggi può essere saltato: è l'unico punto del sistema
in cui un `Signal` diventa (o non diventa) qualcosa che i moduli a valle
(portfolio allocator, execution) possono trasformare in un ordine reale.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from trading_system.common.enums import OrderSide, SignalAction
from trading_system.common.logging_config import get_logger
from trading_system.common.models import RiskDecision, Signal
from trading_system.risk_management.config_loader import RiskLimitsConfig, load_risk_limits
from trading_system.risk_management.position_sizing import PositionSizer
from trading_system.risk_management.stop_loss import compute_stop_loss_price
from trading_system.risk_management.volatility_filter import check_volatility

logger = get_logger(__name__)

_ACTION_TO_SIDE = {SignalAction.BUY: OrderSide.BUY, SignalAction.SELL: OrderSide.SELL}


class RiskManager:
    """Valuta i segnali dello strategy engine contro i limiti di rischio configurati."""

    def __init__(
        self,
        config: RiskLimitsConfig | None = None,
        position_sizer: PositionSizer | None = None,
        volatility_window: int = 20,
        risk_per_trade_pct: float = 1.0,
    ) -> None:
        self._config = config if config is not None else load_risk_limits()
        self._position_sizer = position_sizer or PositionSizer(risk_per_trade_pct=risk_per_trade_pct)
        self._volatility_window = volatility_window

    def _reject(self, signal: Signal, reason: str) -> RiskDecision:
        logger.info(
            "Segnale rifiutato | symbol=%s asset_class=%s reason=%s",
            signal.symbol, signal.asset_class.value, reason,
        )
        return RiskDecision(
            symbol=signal.symbol,
            asset_class=signal.asset_class,
            approved=False,
            action=SignalAction.HOLD,
            quantity=0.0,
            reason=reason,
            signal_confidence=signal.confidence,
            strategy_name=signal.strategy_name,
            evaluated_at=datetime.now(timezone.utc),
        )

    def evaluate_signal(
        self,
        signal: Signal,
        bars: pd.DataFrame,
        account_equity: float,
        current_asset_class_exposure_pct: float = 0.0,
    ) -> RiskDecision:
        """Valuta un segnale e ritorna una decisione approvata o rifiutata, sempre motivata."""

        if signal.action == SignalAction.HOLD:
            return self._reject(signal, "Segnale HOLD: nessuna operazione richiesta.")

        limits = self._config.limits_for(signal.asset_class)
        if not limits.enabled:
            return self._reject(
                signal,
                f"Trading disabilitato per asset_class={signal.asset_class.value} in config/risk_limits.yaml.",
            )

        vol_check = check_volatility(bars, limits, window=self._volatility_window)
        if not vol_check.passed:
            return self._reject(signal, f"Filtro di volatilità non superato: {vol_check.reason}")

        entry_price = float(bars["close"].iloc[-1])
        sizing = self._position_sizer.size_position(
            account_equity=account_equity,
            entry_price=entry_price,
            confidence=signal.confidence,
            limits=limits,
            current_asset_class_exposure_pct=current_asset_class_exposure_pct,
        )
        if sizing.quantity <= 0.0:
            return self._reject(signal, f"Position sizing nullo: {sizing.reason}")

        side = _ACTION_TO_SIDE[signal.action]
        stop_loss_price = compute_stop_loss_price(entry_price, side, limits.stop_loss_pct)

        reason = (
            f"Approvato: {vol_check.reason} {sizing.reason} "
            f"Stop-loss a {stop_loss_price:.4f} ({limits.stop_loss_pct:.1f}%)."
        )
        logger.info(
            "Segnale approvato | symbol=%s asset_class=%s action=%s quantity=%.6f stop_loss=%.4f",
            signal.symbol, signal.asset_class.value, signal.action.value, sizing.quantity, stop_loss_price,
        )
        return RiskDecision(
            symbol=signal.symbol,
            asset_class=signal.asset_class,
            approved=True,
            action=signal.action,
            quantity=sizing.quantity,
            entry_price=entry_price,
            stop_loss_price=stop_loss_price,
            reason=reason,
            signal_confidence=signal.confidence,
            strategy_name=signal.strategy_name,
            evaluated_at=datetime.now(timezone.utc),
        )
