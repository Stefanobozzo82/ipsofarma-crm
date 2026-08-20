"""Broker live per azioni/ETF, via Alpaca (`alpaca-py`).

Richiede `ALPACA_API_KEY` e `ALPACA_API_SECRET` (vedi `.env.example`): se
mancano, il costruttore solleva `ConfigurationError` — nessuna credenziale
viene mai inventata o sostituita da un placeholder.

**Non verificato end-to-end** (nessuna credenziale reale disponibile in
questo ambiente di sviluppo): l'interfaccia di `alpaca-py` è stata
verificata per corrispondenza (classi, firme dei metodi, campi dei modelli
di risposta), ma le chiamate live vanno testate con le tue chiavi prima di
autorizzare qualunque operazione reale.
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


def _default_client_factory(api_key: str, api_secret: str, paper: bool):
    from alpaca.trading.client import TradingClient  # dipendenza opzionale, import lazy

    return TradingClient(api_key=api_key, secret_key=api_secret, paper=paper)


class AlpacaBroker(ExecutionBroker):
    """Broker live per azioni/ETF via Alpaca. `client_factory` iniettabile per i test."""

    name = "alpaca"
    mode = ExecutionMode.LIVE

    def __init__(
        self,
        api_key: str | None,
        api_secret: str | None,
        base_url: str = "https://paper-api.alpaca.markets",
        client_factory: Callable[[str, str, bool], object] | None = None,
    ) -> None:
        if not api_key or not api_secret:
            raise ConfigurationError(
                "Credenziali Alpaca mancanti: imposta ALPACA_API_KEY e ALPACA_API_SECRET "
                "(vedi .env.example). Non vengono inventate."
            )
        is_paper_endpoint = "paper" in base_url
        self._client = (client_factory or _default_client_factory)(api_key, api_secret, is_paper_endpoint)

    def submit_order(
        self,
        symbol: str,
        asset_class: AssetClass,
        side: OrderSide,
        quantity: float,
        strategy_name: str,
        reason: str,
    ) -> Order:
        from alpaca.trading.enums import OrderSide as AlpacaOrderSide
        from alpaca.trading.enums import TimeInForce
        from alpaca.trading.requests import MarketOrderRequest

        now = datetime.now(timezone.utc)
        if quantity <= 0.0:
            return self._order(symbol, asset_class, side, 0.0, strategy_name, OrderStatus.REJECTED, "Quantità non positiva.", now)

        request = MarketOrderRequest(
            symbol=symbol,
            qty=quantity,
            side=AlpacaOrderSide.BUY if side == OrderSide.BUY else AlpacaOrderSide.SELL,
            time_in_force=TimeInForce.DAY,
        )
        try:
            response = self._client.submit_order(order_data=request)
        except Exception as exc:
            logger.error("Errore Alpaca nell'invio ordine per %s: %s", symbol, exc)
            return self._order(
                symbol, asset_class, side, 0.0, strategy_name, OrderStatus.REJECTED,
                f"Errore dal broker Alpaca: {exc}", now,
            )

        filled_price = float(response.filled_avg_price) if getattr(response, "filled_avg_price", None) else None
        filled_qty = float(response.filled_qty) if getattr(response, "filled_qty", None) else 0.0
        status = OrderStatus.FILLED if filled_qty > 0 else OrderStatus.SUBMITTED

        order = Order(
            symbol=symbol, asset_class=asset_class, side=side, quantity=quantity,
            mode=self.mode, broker=self.name, strategy_name=strategy_name,
            status=status, reason=reason,
            filled_price=filled_price, filled_at=now if filled_price is not None else None,
            created_at=now,
        )
        logger.info("Ordine Alpaca inviato | symbol=%s side=%s quantity=%.6f status=%s", symbol, side.value, quantity, status.value)
        return order

    def _order(self, symbol, asset_class, side, quantity, strategy_name, status, reason, now) -> Order:
        return Order(
            symbol=symbol, asset_class=asset_class, side=side, quantity=quantity,
            mode=self.mode, broker=self.name, strategy_name=strategy_name,
            status=status, reason=reason, created_at=now,
        )

    def get_cash(self) -> float:
        try:
            account = self._client.get_account()
        except Exception as exc:
            raise DataSourceError(f"Errore Alpaca nel recupero della cassa: {exc}") from exc
        if account.cash is None:
            raise DataSourceError("Alpaca non ha restituito il valore di cassa del conto.")
        return float(account.cash)

    def get_position(self, symbol: str) -> Position | None:
        try:
            position = self._client.get_open_position(symbol)
        except Exception:
            # alpaca-py solleva un'eccezione (APIError, 404) se non c'è una posizione aperta.
            return None
        return Position(
            symbol=position.symbol,
            asset_class=AssetClass.EQUITY,  # Alpaca non distingue equity/etf lato posizione
            quantity=float(position.qty),
            average_entry_price=float(position.avg_entry_price),
        )

    def get_positions(self) -> list[Position]:
        try:
            positions = self._client.get_all_positions()
        except Exception as exc:
            raise DataSourceError(f"Errore Alpaca nel recupero delle posizioni: {exc}") from exc
        return [
            Position(
                symbol=p.symbol, asset_class=AssetClass.EQUITY,
                quantity=float(p.qty), average_entry_price=float(p.avg_entry_price),
            )
            for p in positions
        ]
