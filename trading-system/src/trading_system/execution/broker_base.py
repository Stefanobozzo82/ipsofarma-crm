"""Interfaccia astratta comune a tutti i broker/exchange di esecuzione.

`PaperBroker` (sempre disponibile, nessuna credenziale) ed i broker live in
`execution.live` (uno per asset class: Alpaca per azioni/ETF, ccxt per
crypto) implementano lo stesso contratto, così che `ExecutionManager` non
debba mai sapere quale broker concreto sta usando.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from trading_system.common.enums import AssetClass, ExecutionMode, OrderSide
from trading_system.common.models import Order, Position


class ExecutionBroker(ABC):
    """Contratto comune per l'esecuzione di ordini, in paper o in live."""

    #: Nome identificativo, usato in `Order.broker` per tracciabilità (es. "paper", "alpaca", "ccxt.kraken").
    name: str

    #: PAPER o LIVE — mai ambiguo, propagato in ogni `Order` prodotto.
    mode: ExecutionMode

    @abstractmethod
    def submit_order(
        self,
        symbol: str,
        asset_class: AssetClass,
        side: OrderSide,
        quantity: float,
        strategy_name: str,
        reason: str,
    ) -> Order:
        """Invia un ordine e ritorna l'`Order` risultante (riempito o rifiutato, mai un'eccezione per un rifiuto normale).

        Un'eccezione deve essere sollevata solo per un errore infrastrutturale
        (connessione al broker, credenziali invalide), non per un rifiuto di
        business (cassa insufficiente, nulla da vendere): quei casi devono
        tornare un `Order` con `status=OrderStatus.REJECTED` e `reason`
        esplicito, per restare tracciabili.
        """

    @abstractmethod
    def get_cash(self) -> float:
        """Liquidità disponibile nel conto (paper o live)."""

    @abstractmethod
    def get_position(self, symbol: str) -> Position | None:
        """Posizione corrente su `symbol`, o `None` se non detenuta."""

    @abstractmethod
    def get_positions(self) -> list[Position]:
        """Tutte le posizioni correnti nel conto."""
