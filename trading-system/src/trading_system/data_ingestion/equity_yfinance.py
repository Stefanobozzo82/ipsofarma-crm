"""Connettore dati per azioni ed ETF, basato su yfinance.

Fonte pubblica, nessuna API key richiesta. Usata come fonte di default per
azioni/ETF; Alpha Vantage e Polygon.io restano opzioni da aggiungere in
futuro (richiedono API key, vedi `.env.example`) come fonti alternative o di
backup, non sostituiscono questo connettore di default.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

import pandas as pd

from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.common.logging_config import get_logger
from trading_system.common.models import MarketBar
from trading_system.data_ingestion.base import DataSource

logger = get_logger(__name__)

# Mappa il nostro Timeframe comune verso gli interval string di yfinance.
_TIMEFRAME_TO_YFINANCE_INTERVAL: dict[Timeframe, str] = {
    Timeframe.MIN_1: "1m",
    Timeframe.MIN_5: "5m",
    Timeframe.MIN_15: "15m",
    Timeframe.HOUR_1: "1h",
    Timeframe.DAY_1: "1d",
    Timeframe.WEEK_1: "1wk",
}


def _default_ticker_factory(symbol: str):
    import yfinance as yf

    return yf.Ticker(symbol)


class EquityYFinanceSource(DataSource):
    """Fonte dati per azioni/ETF via yfinance.

    `ticker_factory` è iniettabile per i test (per evitare chiamate di rete
    reali); di default usa `yfinance.Ticker`.
    """

    name = "yfinance"

    def __init__(
        self,
        asset_class: AssetClass = AssetClass.EQUITY,
        ticker_factory: Callable[[str], object] | None = None,
    ) -> None:
        if asset_class not in (AssetClass.EQUITY, AssetClass.ETF):
            raise ValueError(
                f"EquityYFinanceSource supporta solo EQUITY o ETF, ricevuto: {asset_class}"
            )
        self.asset_class = asset_class
        self._ticker_factory = ticker_factory or _default_ticker_factory

    def get_historical_bars(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: Timeframe = Timeframe.DAY_1,
    ) -> list[MarketBar]:
        interval = _TIMEFRAME_TO_YFINANCE_INTERVAL.get(timeframe)
        if interval is None:
            raise DataSourceError(f"Timeframe non supportato da yfinance: {timeframe}")

        logger.info(
            "Richiesta barre storiche | symbol=%s asset_class=%s timeframe=%s start=%s end=%s",
            symbol, self.asset_class.value, timeframe.value, start, end,
        )
        try:
            ticker = self._ticker_factory(symbol)
            raw = ticker.history(start=start, end=end, interval=interval)
        except Exception as exc:  # pragma: no cover - dipende dalla rete
            raise DataSourceError(
                f"Errore yfinance nel recupero dati per {symbol}: {exc}"
            ) from exc

        if raw is None or raw.empty:
            logger.warning("Nessun dato restituito da yfinance per symbol=%s", symbol)
            return []

        return self._normalize(raw, symbol, timeframe)

    def get_latest_price(self, symbol: str) -> float:
        try:
            ticker = self._ticker_factory(symbol)
            raw = ticker.history(period="1d")
        except Exception as exc:  # pragma: no cover - dipende dalla rete
            raise DataSourceError(
                f"Errore yfinance nel recupero prezzo per {symbol}: {exc}"
            ) from exc

        if raw is None or raw.empty:
            raise DataSourceError(f"Nessun prezzo disponibile per {symbol} (yfinance)")

        return float(raw["Close"].iloc[-1])

    def _normalize(
        self, raw: pd.DataFrame, symbol: str, timeframe: Timeframe
    ) -> list[MarketBar]:
        bars: list[MarketBar] = []
        for ts, row in raw.iterrows():
            timestamp = ts.to_pydatetime()
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            else:
                timestamp = timestamp.astimezone(timezone.utc)
            try:
                bars.append(
                    MarketBar(
                        symbol=symbol,
                        asset_class=self.asset_class,
                        timeframe=timeframe,
                        timestamp=timestamp,
                        open=float(row["Open"]),
                        high=float(row["High"]),
                        low=float(row["Low"]),
                        close=float(row["Close"]),
                        volume=float(row["Volume"]),
                        source=self.name,
                    )
                )
            except (KeyError, ValueError, TypeError) as exc:
                logger.warning("Riga scartata durante la normalizzazione per %s: %s", symbol, exc)
        return bars
