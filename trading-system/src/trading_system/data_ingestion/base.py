"""Interfaccia astratta comune a tutti i connettori dati.

Ogni fonte dati (una per asset class, con possibilità di aggiungerne altre
in futuro come fonti di backup) implementa questa interfaccia e restituisce
`MarketBar` nello schema normalizzato comune, così che strategy engine e
backtesting non debbano mai sapere da dove arrivano i dati.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime

import pandas as pd

from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.models import MarketBar

#: Colonne dello schema normalizzato restituito da `to_dataframe`.
NORMALIZED_COLUMNS = [
    "symbol",
    "asset_class",
    "timeframe",
    "timestamp",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "source",
]


class DataSource(ABC):
    """Contratto comune per un connettore dati di mercato."""

    #: Nome identificativo della fonte, usato per tracciabilità (es. "yfinance").
    name: str

    #: Asset class servita da questa fonte.
    asset_class: AssetClass

    @abstractmethod
    def get_historical_bars(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: Timeframe = Timeframe.DAY_1,
    ) -> list[MarketBar]:
        """Recupera barre OHLCV storiche per `symbol` tra `start` ed `end`.

        Deve restituire una lista (eventualmente vuota) di `MarketBar` già
        normalizzate, ordinate per timestamp crescente. In caso di errore di
        rete o di simbolo non trovato, deve sollevare
        `trading_system.common.exceptions.DataSourceError` con un messaggio
        chiaro, non restituire dati parziali silenziosamente.
        """

    @abstractmethod
    def get_latest_price(self, symbol: str) -> float:
        """Restituisce l'ultimo prezzo disponibile per `symbol`."""


def bars_to_dataframe(bars: list[MarketBar]) -> pd.DataFrame:
    """Converte una lista di `MarketBar` nello schema normalizzato in DataFrame.

    Usato da storage e, più avanti, da strategy engine/backtesting, per
    lavorare su dati tabellari senza doversi preoccupare della fonte.
    """
    if not bars:
        return pd.DataFrame(columns=NORMALIZED_COLUMNS)

    return pd.DataFrame(
        [
            {
                "symbol": bar.symbol,
                "asset_class": bar.asset_class.value,
                "timeframe": bar.timeframe.value,
                "timestamp": bar.timestamp,
                "open": bar.open,
                "high": bar.high,
                "low": bar.low,
                "close": bar.close,
                "volume": bar.volume,
                "source": bar.source,
            }
            for bar in bars
        ],
        columns=NORMALIZED_COLUMNS,
    )
