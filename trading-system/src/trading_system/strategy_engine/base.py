"""Interfaccia astratta comune a tutte le strategie.

Ogni strategia è specifica per una asset class (una regola per ETF non è la
stessa per crypto o azioni, per specifica di prodotto), ma tutte
implementano lo stesso contratto e restituiscono un
`trading_system.common.models.Signal` con score di confidenza e motivazione
esplicita: nessuna strategia può restituire un segnale senza spiegare da
dove viene.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone

import pandas as pd

from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.models import Signal

#: Colonne minime richieste in ogni DataFrame passato a `generate_signal`.
REQUIRED_COLUMNS = {"timestamp", "close"}


def clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    """Vincola `value` nell'intervallo [lower, upper]."""
    return max(lower, min(upper, value))


class Strategy(ABC):
    """Contratto comune per una regola di strategia."""

    #: Nome identificativo, usato in `Signal.strategy_name` per tracciabilità.
    name: str

    #: Asset class per cui questa strategia è valida.
    asset_class: AssetClass

    def validate_bars(self, bars: pd.DataFrame) -> None:
        missing = REQUIRED_COLUMNS - set(bars.columns)
        if missing:
            raise ValueError(
                f"DataFrame di input alla strategia '{self.name}' privo delle colonne richieste: {missing}"
            )

    def _hold(self, symbol: str, reason: str, confidence: float = 0.0) -> Signal:
        """Costruisce un segnale HOLD (nessuna operazione), con motivazione esplicita."""
        return Signal(
            symbol=symbol,
            asset_class=self.asset_class,
            action=SignalAction.HOLD,
            confidence=clamp(confidence),
            reason=reason,
            generated_at=datetime.now(timezone.utc),
            strategy_name=self.name,
        )

    @abstractmethod
    def generate_signal(self, symbol: str, bars: pd.DataFrame, **context) -> Signal:
        """Genera un segnale per `symbol` a partire dalle barre storiche normalizzate.

        `bars` deve essere ordinato per timestamp crescente (schema comune
        prodotto da `trading_system.data_ingestion.base.bars_to_dataframe`).
        `**context` porta dati extra specifici della strategia (es.
        `fundamentals` per le strategie azionarie) — le strategie che non ne
        hanno bisogno lo ignorano.
        """
