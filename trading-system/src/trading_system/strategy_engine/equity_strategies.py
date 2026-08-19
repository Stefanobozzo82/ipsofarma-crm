"""Strategie per azioni: media mobile tecnica + filtro fondamentale.

Regola: come per gli ETF, la componente tecnica confronta due medie mobili
sul prezzo di chiusura. A differenza degli ETF, per le azioni ha senso un
filtro fondamentale (P/E, ROE, debito/equity, crescita ricavi): se i
fondamentali sono deboli, un segnale BUY tecnico viene **declassato a
HOLD** (veto) invece di essere semplicemente scalato — comprare un titolo
in trend ma con bilanci deboli è il caso in cui l'analisi tecnica da sola
sarebbe fuorviante. Se i fondamentali sono nella norma, contribuiscono a
rafforzare (o indebolire) la confidenza del segnale tecnico.

I fondamentali sono opzionali (`context["fundamentals"]`, un dict come
restituito da `EquityYFinanceSource.get_fundamentals`): se assenti, la
strategia degrada a segnale puramente tecnico e lo dichiara esplicitamente
nella motivazione, non lo nasconde.
"""

from __future__ import annotations

import pandas as pd

from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.models import Signal
from trading_system.strategy_engine.base import Strategy, clamp
from trading_system.strategy_engine.indicators import sma

#: Peso della componente fondamentale nella confidenza finale, quando disponibile.
_FUNDAMENTAL_WEIGHT = 0.4
_TECHNICAL_WEIGHT = 1.0 - _FUNDAMENTAL_WEIGHT


class EquityMovingAverageFundamentalsStrategy(Strategy):
    """Segnale di trend (SMA) filtrato/rafforzato da un punteggio fondamentale."""

    asset_class = AssetClass.EQUITY

    def __init__(
        self,
        short_window: int = 20,
        long_window: int = 50,
        confidence_scale_pct: float = 5.0,
        max_pe_ratio: float = 30.0,
        min_return_on_equity: float = 0.10,
        max_debt_to_equity: float = 200.0,
        min_revenue_growth: float = 0.0,
        veto_below_score: float = 0.5,
    ) -> None:
        if short_window >= long_window:
            raise ValueError("short_window deve essere minore di long_window")

        self.name = f"equity_ma_fundamentals_{short_window}_{long_window}"
        self.short_window = short_window
        self.long_window = long_window
        self.confidence_scale_pct = confidence_scale_pct
        self.max_pe_ratio = max_pe_ratio
        self.min_return_on_equity = min_return_on_equity
        self.max_debt_to_equity = max_debt_to_equity
        self.min_revenue_growth = min_revenue_growth
        self.veto_below_score = veto_below_score

    def _score_fundamentals(self, fundamentals: dict) -> tuple[float | None, list[str]]:
        """Punteggio in [0, 1]: quota di criteri superati sui criteri con dato disponibile.

        Ritorna (None, []) se nessun criterio ha dati disponibili (non è
        possibile esprimere un giudizio).
        """
        criteria = [
            ("P/E", fundamentals.get("pe_ratio"), lambda v: v > 0 and v <= self.max_pe_ratio),
            ("ROE", fundamentals.get("return_on_equity"), lambda v: v >= self.min_return_on_equity),
            ("Debito/Equity", fundamentals.get("debt_to_equity"), lambda v: v <= self.max_debt_to_equity),
            ("Crescita ricavi", fundamentals.get("revenue_growth"), lambda v: v >= self.min_revenue_growth),
        ]

        evaluated = [(label, check(value)) for label, value, check in criteria if value is not None]
        if not evaluated:
            return None, []

        passed = sum(1 for _, ok in evaluated if ok)
        score = passed / len(evaluated)
        details = [f"{label}={'OK' if ok else 'debole'}" for label, ok in evaluated]
        return score, details

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
        technical_confidence = clamp(abs(spread_pct) / self.confidence_scale_pct)

        if sma_short > sma_long:
            action = SignalAction.BUY
            trend = "rialzista"
        elif sma_short < sma_long:
            action = SignalAction.SELL
            trend = "ribassista"
        else:
            action = SignalAction.HOLD
            trend = "assente"
            technical_confidence = 0.0

        technical_reason = (
            f"SMA({self.short_window})={sma_short:.4f} vs SMA({self.long_window})={sma_long:.4f} "
            f"(scostamento {spread_pct:+.2f}%) => trend {trend}."
        )

        fundamentals = context.get("fundamentals")
        if not fundamentals:
            return Signal(
                symbol=symbol,
                asset_class=self.asset_class,
                action=action,
                confidence=technical_confidence,
                reason=f"{technical_reason} Fondamentali non disponibili: segnale solo tecnico.",
                generated_at=pd.Timestamp.now(tz="UTC").to_pydatetime(),
                strategy_name=self.name,
            )

        fundamental_score, details = self._score_fundamentals(fundamentals)
        if fundamental_score is None:
            return Signal(
                symbol=symbol,
                asset_class=self.asset_class,
                action=action,
                confidence=technical_confidence,
                reason=f"{technical_reason} Nessun dato fondamentale valido: segnale solo tecnico.",
                generated_at=pd.Timestamp.now(tz="UTC").to_pydatetime(),
                strategy_name=self.name,
            )

        fundamentals_summary = ", ".join(details)

        if action == SignalAction.BUY and fundamental_score < self.veto_below_score:
            return Signal(
                symbol=symbol,
                asset_class=self.asset_class,
                action=SignalAction.HOLD,
                confidence=0.0,
                reason=(
                    f"{technical_reason} Segnale BUY tecnico VETATO da fondamentali deboli "
                    f"(score {fundamental_score:.2f} < soglia {self.veto_below_score:.2f}: {fundamentals_summary})."
                ),
                generated_at=pd.Timestamp.now(tz="UTC").to_pydatetime(),
                strategy_name=self.name,
            )

        blended_confidence = clamp(
            _TECHNICAL_WEIGHT * technical_confidence + _FUNDAMENTAL_WEIGHT * fundamental_score
        )

        return Signal(
            symbol=symbol,
            asset_class=self.asset_class,
            action=action,
            confidence=blended_confidence,
            reason=(
                f"{technical_reason} Fondamentali: score {fundamental_score:.2f} ({fundamentals_summary}) "
                f"=> confidenza combinata {blended_confidence:.2f}."
            ),
            generated_at=pd.Timestamp.now(tz="UTC").to_pydatetime(),
            strategy_name=self.name,
        )
