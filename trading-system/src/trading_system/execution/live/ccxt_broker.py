"""Broker live per crypto, via ccxt in modalità autenticata.

Stesso pacchetto già usato dal modulo 1 per i dati pubblici; qui con le
chiamate di trading, che richiedono API key/secret dell'exchange (vedi
`.env.example`). Se mancano, il costruttore solleva `ConfigurationError`.

**Limitazione dichiarata**: gli exchange spot non tracciano un prezzo medio
di carico per le tue posizioni (a differenza di un broker azionario) — un
saldo in BTC è solo un saldo, non porta con sé la storia di quanto hai
pagato per accumularlo. `average_entry_price` in `get_position`/
`get_positions` è quindi sempre `0.0` (sentinella esplicita di "non
disponibile da questo broker"), non un valore inventato: se ti serve un
costo medio di carico reale, va calcolato altrove a partire dallo storico
ordini (`execution.storage.ExecutionRepository`), non richiesto qui.

**Non verificato end-to-end** (nessuna credenziale reale disponibile in
questo ambiente di sviluppo): l'interfaccia ccxt (`create_order`,
`fetch_balance`) è stata verificata per corrispondenza, ma le chiamate live
vanno testate con le tue chiavi prima di autorizzare qualunque operazione
reale.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide, OrderStatus
from trading_system.common.exceptions import ConfigurationError, DataSourceError
from trading_system.common.logging_config import get_logger
from trading_system.common.models import Order, Position
from trading_system.execution.broker_base import ExecutionBroker

logger = get_logger(__name__)


def _default_exchange_factory(exchange_id: str, api_key: str, api_secret: str):
    import ccxt

    exchange_class = getattr(ccxt, exchange_id, None)
    if exchange_class is None:
        raise ConfigurationError(f"Exchange ccxt sconosciuto: {exchange_id}")
    return exchange_class({"apiKey": api_key, "secret": api_secret, "enableRateLimit": True})


class CCXTBroker(ExecutionBroker):
    """Broker live per crypto via ccxt. `exchange_factory` iniettabile per i test."""

    mode = ExecutionMode.LIVE

    def __init__(
        self,
        exchange_id: str,
        api_key: str | None,
        api_secret: str | None,
        quote_currency: str = "USDT",
        exchange_factory: Callable[[str, str, str], object] | None = None,
    ) -> None:
        if not api_key or not api_secret:
            raise ConfigurationError(
                f"Credenziali mancanti per l'exchange '{exchange_id}': imposta le variabili "
                f"{exchange_id.upper()}_API_KEY e {exchange_id.upper()}_API_SECRET (vedi .env.example). "
                f"Non vengono inventate."
            )
        self.name = f"ccxt.{exchange_id}"
        self._quote_currency = quote_currency
        self._exchange = (exchange_factory or _default_exchange_factory)(exchange_id, api_key, api_secret)

    def submit_order(
        self,
        symbol: str,
        asset_class: AssetClass,
        side: OrderSide,
        quantity: float,
        strategy_name: str,
        reason: str,
    ) -> Order:
        now = datetime.now(timezone.utc)
        if quantity <= 0.0:
            return self._order(symbol, asset_class, side, 0.0, strategy_name, OrderStatus.REJECTED, "Quantità non positiva.", now)

        try:
            response = self._exchange.create_order(symbol, "market", side.value, quantity)
        except Exception as exc:
            logger.error("Errore %s nell'invio ordine per %s: %s", self.name, symbol, exc)
            return self._order(
                symbol, asset_class, side, 0.0, strategy_name, OrderStatus.REJECTED,
                f"Errore dall'exchange {self.name}: {exc}", now,
            )

        filled_qty = float(response.get("filled") or 0.0)
        filled_price = response.get("average") or response.get("price")
        status = OrderStatus.FILLED if filled_qty > 0 else OrderStatus.SUBMITTED

        order = Order(
            symbol=symbol, asset_class=asset_class, side=side, quantity=quantity,
            mode=self.mode, broker=self.name, strategy_name=strategy_name,
            status=status, reason=reason,
            filled_price=float(filled_price) if filled_price is not None else None,
            filled_at=now if filled_qty > 0 else None,
            created_at=now,
        )
        logger.info("Ordine %s inviato | symbol=%s side=%s quantity=%.6f status=%s", self.name, symbol, side.value, quantity, status.value)
        return order

    def _order(self, symbol, asset_class, side, quantity, strategy_name, status, reason, now) -> Order:
        return Order(
            symbol=symbol, asset_class=asset_class, side=side, quantity=quantity,
            mode=self.mode, broker=self.name, strategy_name=strategy_name,
            status=status, reason=reason, created_at=now,
        )

    def get_cash(self) -> float:
        try:
            balance = self._exchange.fetch_balance()
        except Exception as exc:
            raise DataSourceError(f"Errore {self.name} nel recupero del saldo: {exc}") from exc
        free = balance.get(self._quote_currency, {}).get("free")
        return float(free) if free is not None else 0.0

    def get_position(self, symbol: str) -> Position | None:
        base_currency = symbol.split("/")[0]
        try:
            balance = self._exchange.fetch_balance()
        except Exception as exc:
            raise DataSourceError(f"Errore {self.name} nel recupero del saldo: {exc}") from exc
        total = balance.get(base_currency, {}).get("total")
        if not total or total <= 0.0:
            return None
        return Position(symbol=symbol, asset_class=AssetClass.CRYPTO, quantity=float(total), average_entry_price=0.0)

    def get_positions(self) -> list[Position]:
        try:
            balance = self._exchange.fetch_balance()
        except Exception as exc:
            raise DataSourceError(f"Errore {self.name} nel recupero del saldo: {exc}") from exc

        positions = []
        for currency, amounts in balance.items():
            if currency in (self._quote_currency, "info", "free", "used", "total"):
                continue
            total = amounts.get("total") if isinstance(amounts, dict) else None
            if total and total > 0.0:
                positions.append(
                    Position(
                        symbol=f"{currency}/{self._quote_currency}",
                        asset_class=AssetClass.CRYPTO,
                        quantity=float(total),
                        average_entry_price=0.0,
                    )
                )
        return positions
