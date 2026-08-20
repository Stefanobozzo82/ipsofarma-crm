"""Calcolo e verifica dello stop-loss.

Stop-loss percentuale semplice, simmetrico rispetto al lato della posizione:
per una posizione lunga (BUY) lo stop è sotto il prezzo di entrata, per una
posizione corta (SELL) è sopra. La percentuale viene sempre letta da
`config/risk_limits.yaml` (per asset class) — non è mai un valore inventato
qui.
"""

from __future__ import annotations

from trading_system.common.enums import OrderSide


def compute_stop_loss_price(entry_price: float, side: OrderSide, stop_loss_pct: float) -> float:
    """Prezzo di stop-loss dato un prezzo di entrata, il lato e la percentuale di rischio.

    `stop_loss_pct` è una percentuale (es. 5.0 per il 5%), non una frazione.
    """
    if entry_price <= 0:
        raise ValueError("entry_price deve essere positivo")
    if stop_loss_pct <= 0:
        raise ValueError("stop_loss_pct deve essere positivo")

    fraction = stop_loss_pct / 100.0
    if side == OrderSide.BUY:
        return entry_price * (1.0 - fraction)
    return entry_price * (1.0 + fraction)


def is_stop_triggered(current_price: float, stop_loss_price: float, side: OrderSide) -> bool:
    """True se `current_price` ha raggiunto/superato lo stop-loss per una posizione `side`."""
    if side == OrderSide.BUY:
        return current_price <= stop_loss_price
    return current_price >= stop_loss_price
