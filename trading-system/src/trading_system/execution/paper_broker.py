"""Broker paper trading: simula l'esecuzione senza denaro reale.

È il broker di default del sistema (`config/execution.yaml: mode: paper`).
Nessuna credenziale richiesta. Simula:

- commissioni configurabili (`config/execution.yaml: paper.commission_pct`);
- rifiuto per cassa insufficiente su un BUY;
- rifiuto per vendita allo scoperto su un SELL (niente short: stessa scelta
  del motore di backtest, modulo 5, per coerenza);
- prezzo di mercato fornito da un `price_provider` iniettabile (in
  produzione, l'ultimo prezzo dai connettori del modulo 1).

Lo stato del conto (cassa, posizioni) è persistito via
`ExecutionRepository`, così da sopravvivere tra esecuzioni successive — è
ciò che rende possibile un "periodo di validazione" in paper trading
(vedi `execution.gate.LiveTradingGate`), non solo una simulazione usa e getta.

Nota di design: questo broker (come quelli live in `execution.live`) NON
registra da sé l'`Order` prodotto nello storico ordini —
`ExecutionManager` è l'unico punto che scrive nella tabella `execution_orders`,
per ogni broker allo stesso modo, cosicché lo storico resti unificato paper
+ live indipendentemente da quale broker concreto ha eseguito l'ordine.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide, OrderStatus
from trading_system.common.logging_config import get_logger
from trading_system.common.models import Order, Position
from trading_system.execution.broker_base import ExecutionBroker
from trading_system.execution.storage import ExecutionRepository

logger = get_logger(__name__)


class PaperBroker(ExecutionBroker):
    """Broker simulato, con stato persistito (cassa, posizioni, storico ordini)."""

    name = "paper"
    mode = ExecutionMode.PAPER

    def __init__(
        self,
        repository: ExecutionRepository,
        price_provider: Callable[[str, AssetClass], float],
        initial_cash: float = 100_000.0,
        commission_pct: float = 0.0,
    ) -> None:
        self._repository = repository
        self._price_provider = price_provider
        self._commission_pct = commission_pct
        self._repository.ensure_paper_account(initial_cash)

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
            return self._reject(symbol, asset_class, side, quantity, strategy_name, "Quantità non positiva.", now)

        try:
            price = self._price_provider(symbol, asset_class)
        except Exception as exc:
            return self._reject(
                symbol, asset_class, side, quantity, strategy_name,
                f"Prezzo di mercato non disponibile: {exc}", now,
            )
        if price <= 0.0:
            return self._reject(symbol, asset_class, side, quantity, strategy_name, "Prezzo di mercato non positivo.", now)

        commission = quantity * price * self._commission_pct / 100.0

        if side == OrderSide.BUY:
            cost = quantity * price + commission
            cash = self._repository.get_cash()
            if cost > cash:
                return self._reject(
                    symbol, asset_class, side, quantity, strategy_name,
                    f"Cassa insufficiente: servono {cost:.2f}, disponibili {cash:.2f}.", now,
                )
            self._repository.set_cash(cash - cost)
            self._repository.add_to_position(symbol, asset_class, quantity, price)
        else:
            position = self._repository.get_position(symbol)
            held = position.quantity if position is not None else 0.0
            if quantity > held + 1e-9:
                return self._reject(
                    symbol, asset_class, side, quantity, strategy_name,
                    f"Impossibile vendere {quantity:.6f} {symbol}: detenute solo {held:.6f} "
                    f"(niente vendite allo scoperto in paper trading).", now,
                )
            proceeds = quantity * price - commission
            self._repository.set_cash(self._repository.get_cash() + proceeds)
            self._repository.reduce_position(symbol, quantity)

        order = Order(
            symbol=symbol, asset_class=asset_class, side=side, quantity=quantity,
            mode=self.mode, broker=self.name, strategy_name=strategy_name,
            status=OrderStatus.FILLED, reason=reason,
            filled_price=price, filled_at=now, created_at=now,
        )
        logger.info(
            "Ordine paper eseguito | symbol=%s side=%s quantity=%.6f price=%.4f",
            symbol, side.value, quantity, price,
        )
        return order

    def _reject(
        self,
        symbol: str,
        asset_class: AssetClass,
        side: OrderSide,
        quantity: float,
        strategy_name: str,
        reason: str,
        now: datetime,
    ) -> Order:
        order = Order(
            symbol=symbol, asset_class=asset_class, side=side, quantity=0.0,
            mode=self.mode, broker=self.name, strategy_name=strategy_name,
            status=OrderStatus.REJECTED, reason=reason, created_at=now,
        )
        logger.info("Ordine paper rifiutato | symbol=%s side=%s reason=%s", symbol, side.value, reason)
        return order

    def get_cash(self) -> float:
        return self._repository.get_cash()

    def get_position(self, symbol: str) -> Position | None:
        row = self._repository.get_position(symbol)
        if row is None:
            return None
        return Position(
            symbol=row.symbol,
            asset_class=AssetClass(row.asset_class),
            quantity=row.quantity,
            average_entry_price=row.average_entry_price,
        )

    def get_positions(self) -> list[Position]:
        return [
            Position(
                symbol=row.symbol,
                asset_class=AssetClass(row.asset_class),
                quantity=row.quantity,
                average_entry_price=row.average_entry_price,
            )
            for row in self._repository.get_positions()
        ]
