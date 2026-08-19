"""Strategie per ETF: media mobile (trend-following).

Regola: confronta una media mobile "corta" con una "lunga" sul prezzo di
chiusura. Corta sopra lunga => trend rialzista (BUY); corta sotto lunga =>
trend ribassista (SELL); altrimenti nessun trend chiaro (HOLD). La
confidenza è proporzionale allo scostamento percentuale tra le due medie:
un trend appena accennato genera un segnale debole, un trend marcato un
segnale forte.

Questa è la stessa regola di base che riusa
`equity_strategies.EquityMovingAverageFundamentalsStrategy` per la gamba
tecnica delle azioni: per gli ETF, a differenza delle azioni, non ha senso
applicare filtri fondamentali (un ETF non ha un P/E), quindi resta un
segnale puramente tecnico. Il "rebalancing" citato nella specifica di
prodotto è una decisione di portafoglio (quanto capitale spostare quando
questo segnale scatta), di competenza del modulo 4 (portfolio allocator),
non dello strategy engine.
"""

from __future__ import annotations

import pandas as pd

from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.models import Signal
from trading_system.strategy_engine.base import Strategy, clamp
from trading_system.strategy_engine.indicators import sma


class MovingAverageCrossoverStrategy(Strategy):
    """Segnale di trend basato sul rapporto tra due medie mobili."""

    asset_class = AssetClass.ETF

    def __init__(
        self,
        short_window: int = 20,
        long_window: int = 50,
        confidence_scale_pct: float = 5.0,
    ) -> None:
        if short_window >= long_window:
            raise ValueError("short_window deve essere minore di long_window")
        if confidence_scale_pct <= 0:
            raise ValueError("confidence_scale_pct deve essere positivo")

        self.name = f"etf_moving_average_{short_window}_{long_window}"
        self.short_window = short_window
        self.long_window = long_window
        self.confidence_scale_pct = confidence_scale_pct

    def generate_signal(self, symbol: str, bars: pd.DataFrame, **context) -> Signal:
        self.validate_bars(bars)

        if len(bars) < self.long_window:
            return self._hold(
                symbol,
                reason=(
                    f"Dati insufficienti per SMA({self.long_window}): "
                    f"disponibili {len(bars)} barre."
                ),
            )

        close = bars["close"]
        sma_short = sma(close, self.short_window).iloc[-1]
        sma_long = sma(close, self.long_window).iloc[-1]

        spread_pct = (sma_short - sma_long) / sma_long * 100.0
        confidence = clamp(abs(spread_pct) / self.confidence_scale_pct)

        if sma_short > sma_long:
            action = SignalAction.BUY
            trend = "rialzista"
        elif sma_short < sma_long:
            action = SignalAction.SELL
            trend = "ribassista"
        else:
            action = SignalAction.HOLD
            trend = "assente"
            confidence = 0.0

        reason = (
            f"SMA({self.short_window})={sma_short:.4f} vs SMA({self.long_window})={sma_long:.4f} "
            f"(scostamento {spread_pct:+.2f}%) => trend {trend}."
        )

        return Signal(
            symbol=symbol,
            asset_class=self.asset_class,
            action=action,
            confidence=confidence,
            reason=reason,
            generated_at=pd.Timestamp.now(tz="UTC").to_pydatetime(),
            strategy_name=self.name,
        )
