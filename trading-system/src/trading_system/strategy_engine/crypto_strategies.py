"""Strategie per crypto: RSI con filtro di volatilità.

Regola: RSI in ipervenduto => BUY, RSI in ipercomprato => SELL, altrimenti
HOLD. La confidenza è proporzionale a quanto l'RSI è oltre la soglia (più è
estremo, più il segnale è forte). Sopra la soglia di volatilità annualizzata
configurata, il segnale viene **sempre** forzato a HOLD indipendentemente
dall'RSI: per le crypto la volatilità è un filtro di rischio che ha priorità
sul segnale tecnico, in linea con il vincolo di prodotto che le tratta come
asset ad alto rischio a prescindere.
"""

from __future__ import annotations

import pandas as pd

from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.models import Signal
from trading_system.strategy_engine.base import Strategy, clamp
from trading_system.strategy_engine.indicators import annualized_volatility, rsi


class RSIVolatilityStrategy(Strategy):
    """Segnale RSI (ipercomprato/ipervenduto) filtrato per volatilità."""

    asset_class = AssetClass.CRYPTO

    def __init__(
        self,
        rsi_period: int = 14,
        rsi_oversold: float = 30.0,
        rsi_overbought: float = 70.0,
        volatility_window: int = 20,
        max_volatility_annualized: float = 0.80,
    ) -> None:
        if not 0 < rsi_oversold < rsi_overbought < 100:
            raise ValueError("Deve valere 0 < rsi_oversold < rsi_overbought < 100")
        if max_volatility_annualized <= 0:
            raise ValueError("max_volatility_annualized deve essere positivo")

        self.name = f"crypto_rsi_volatility_{rsi_period}"
        self.rsi_period = rsi_period
        self.rsi_oversold = rsi_oversold
        self.rsi_overbought = rsi_overbought
        self.volatility_window = volatility_window
        self.max_volatility_annualized = max_volatility_annualized

    def generate_signal(self, symbol: str, bars: pd.DataFrame, **context) -> Signal:
        self.validate_bars(bars)

        min_required = max(self.rsi_period, self.volatility_window) + 1
        if len(bars) < min_required:
            return self._hold(
                symbol,
                reason=f"Dati insufficienti: servono almeno {min_required} barre, disponibili {len(bars)}.",
            )

        close = bars["close"]
        last_rsi = rsi(close, self.rsi_period).iloc[-1]
        last_vol = annualized_volatility(close, self.volatility_window).iloc[-1]

        if pd.isna(last_rsi) or pd.isna(last_vol):
            return self._hold(symbol, reason="RSI o volatilità non calcolabili sui dati disponibili.")

        if last_vol > self.max_volatility_annualized:
            return self._hold(
                symbol,
                reason=(
                    f"Filtro di rischio attivato: volatilità annualizzata {last_vol:.1%} "
                    f"supera la soglia {self.max_volatility_annualized:.1%} per le crypto — "
                    f"segnale forzato a HOLD indipendentemente dall'RSI ({last_rsi:.1f})."
                ),
            )

        if last_rsi <= self.rsi_oversold:
            action = SignalAction.BUY
            confidence = clamp((self.rsi_oversold - last_rsi) / self.rsi_oversold)
            reason = (
                f"RSI({self.rsi_period})={last_rsi:.1f} in ipervenduto (soglia {self.rsi_oversold}), "
                f"volatilità annualizzata {last_vol:.1%} entro la soglia {self.max_volatility_annualized:.1%}."
            )
        elif last_rsi >= self.rsi_overbought:
            action = SignalAction.SELL
            confidence = clamp((last_rsi - self.rsi_overbought) / (100.0 - self.rsi_overbought))
            reason = (
                f"RSI({self.rsi_period})={last_rsi:.1f} in ipercomprato (soglia {self.rsi_overbought}), "
                f"volatilità annualizzata {last_vol:.1%} entro la soglia {self.max_volatility_annualized:.1%}."
            )
        else:
            action = SignalAction.HOLD
            confidence = 0.0
            reason = (
                f"RSI({self.rsi_period})={last_rsi:.1f} in zona neutra "
                f"({self.rsi_oversold}-{self.rsi_overbought}): nessun segnale."
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
