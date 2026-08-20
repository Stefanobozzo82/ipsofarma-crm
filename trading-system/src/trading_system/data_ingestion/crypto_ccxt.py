"""Connettore dati crypto, basato su ccxt.

Usa gli endpoint pubblici (`fetch_ohlcv`, `fetch_ticker`), che non
richiedono API key su Binance/Kraken e sulla maggior parte degli exchange
supportati da ccxt. Le API key exchange (vedi `.env.example`) servono solo
al modulo 6 (execution) per piazzare ordini reali, non per leggere dati di
mercato.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.common.logging_config import get_logger
from trading_system.common.models import MarketBar
from trading_system.data_ingestion.base import DataSource

logger = get_logger(__name__)

# Numero massimo di candele richieste per singola chiamata a fetch_ohlcv.
_PAGE_LIMIT = 1000
# Numero massimo di pagine da richiedere in un singolo get_historical_bars,
# a protezione contro loop involontari su range temporali troppo ampi.
_MAX_PAGES = 20


def _default_exchange_factory(exchange_id: str):
    import ccxt

    exchange_class = getattr(ccxt, exchange_id, None)
    if exchange_class is None:
        raise DataSourceError(f"Exchange ccxt sconosciuto: {exchange_id}")
    return exchange_class({"enableRateLimit": True})


class CryptoCCXTSource(DataSource):
    """Fonte dati crypto via ccxt, per un singolo exchange.

    `exchange_factory` è iniettabile per i test; di default costruisce
    l'istanza ccxt dell'exchange richiesto (Binance per default).
    """

    asset_class = AssetClass.CRYPTO

    def __init__(
        self,
        exchange_id: str = "binance",
        exchange_factory: Callable[[str], object] | None = None,
    ) -> None:
        self.exchange_id = exchange_id
        self.name = f"ccxt.{exchange_id}"
        self._exchange = (exchange_factory or _default_exchange_factory)(exchange_id)

    def get_historical_bars(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        timeframe: Timeframe = Timeframe.DAY_1,
    ) -> list[MarketBar]:
        ccxt_timeframe = timeframe.value  # gli enum condividono la notazione ccxt (1m, 1h, 1d, 1w, ...)

        logger.info(
            "Richiesta barre storiche | symbol=%s asset_class=crypto exchange=%s timeframe=%s start=%s end=%s",
            symbol, self.exchange_id, ccxt_timeframe, start, end,
        )

        since_ms = int(start.replace(tzinfo=start.tzinfo or timezone.utc).timestamp() * 1000)
        end_ms = int(end.replace(tzinfo=end.tzinfo or timezone.utc).timestamp() * 1000)

        all_rows: list[list] = []
        cursor = since_ms
        for _ in range(_MAX_PAGES):
            try:
                rows = self._exchange.fetch_ohlcv(
                    symbol, timeframe=ccxt_timeframe, since=cursor, limit=_PAGE_LIMIT
                )
            except Exception as exc:  # pragma: no cover - dipende dalla rete
                raise DataSourceError(
                    f"Errore ccxt ({self.exchange_id}) nel recupero dati per {symbol}: {exc}"
                ) from exc

            if not rows:
                break

            all_rows.extend(rows)
            last_ts = rows[-1][0]
            if last_ts >= end_ms or len(rows) < _PAGE_LIMIT:
                break
            cursor = last_ts + 1

        if not all_rows:
            logger.warning("Nessun dato restituito da ccxt.%s per symbol=%s", self.exchange_id, symbol)
            return []

        return self._normalize(all_rows, symbol, timeframe, since_ms, end_ms)

    def get_latest_price(self, symbol: str) -> float:
        try:
            ticker = self._exchange.fetch_ticker(symbol)
        except Exception as exc:  # pragma: no cover - dipende dalla rete
            raise DataSourceError(
                f"Errore ccxt ({self.exchange_id}) nel recupero prezzo per {symbol}: {exc}"
            ) from exc

        last = ticker.get("last")
        if last is None:
            raise DataSourceError(f"Nessun prezzo disponibile per {symbol} ({self.exchange_id})")
        return float(last)

    def _normalize(
        self,
        rows: list[list],
        symbol: str,
        timeframe: Timeframe,
        since_ms: int,
        end_ms: int,
    ) -> list[MarketBar]:
        bars: list[MarketBar] = []
        for row in rows:
            ts_ms, o, h, l, c, v = row
            if ts_ms < since_ms or ts_ms > end_ms:
                continue
            timestamp = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
            try:
                bars.append(
                    MarketBar(
                        symbol=symbol,
                        asset_class=self.asset_class,
                        timeframe=timeframe,
                        timestamp=timestamp,
                        open=float(o),
                        high=float(h),
                        low=float(l),
                        close=float(c),
                        volume=float(v or 0.0),
                        source=self.name,
                    )
                )
            except (TypeError, ValueError) as exc:
                logger.warning("Riga scartata durante la normalizzazione per %s: %s", symbol, exc)
        bars.sort(key=lambda b: b.timestamp)
        return bars
