"""Modulo 4 — Portfolio allocator.

Decide come distribuire il capitale tra le tre asset class in base al
rischio complessivo desiderato (`config/portfolio.yaml`, validato contro i
tetti di `config/risk_limits.yaml` al caricamento — un profilo non può mai
superare i limiti di rischio del modulo 3, solo starne più prudentemente
sotto).

Due funzioni distinte:

- `PortfolioAllocator.allocate`: arbitra il budget di portafoglio tra le
  `RiskDecision` approvate dal modulo 3, quando più segnali BUY concorrono
  sulla stessa asset class (priorità alla confidenza più alta).
- `PortfolioAllocator.check_rebalance`: segnala quando il peso attuale di
  un'asset class si scosta troppo dal target (es. per il solo movimento dei
  prezzi), producendo `RebalanceAction` — è qui che vive la logica di
  "rebalancing" citata per gli ETF nella specifica di prodotto, generalizzata
  a tutte le asset class.
"""

from trading_system.portfolio.allocator import PortfolioAllocator
from trading_system.portfolio.config_loader import (
    AllocationProfile,
    PortfolioConfig,
    load_portfolio_config,
)

__all__ = [
    "PortfolioAllocator",
    "AllocationProfile",
    "PortfolioConfig",
    "load_portfolio_config",
]
