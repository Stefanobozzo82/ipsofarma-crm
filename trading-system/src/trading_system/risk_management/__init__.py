"""Modulo 3 — Risk management.

Trasforma un `Signal` (modulo 2) in un `RiskDecision`: position sizing e
limiti separati per asset class (letti da `config/risk_limits.yaml`,
validato e non aggirabile — vedi `config_loader`), filtro di volatilità che
esclude asset sopra soglia di rischio per categoria, stop-loss. Nessuna
operazione (nemmeno in paper trading) può essere autorizzata se
`config/risk_limits.yaml` non è stato compilato ed abilitato esplicitamente,
e i limiti su crypto devono essere sempre più stringenti di quelli su
azioni/ETF: è un vincolo di prodotto validato a runtime da questo modulo,
non solo un default suggerito.
"""

from trading_system.risk_management.config_loader import (
    AssetClassRiskLimits,
    PortfolioRiskLimits,
    RiskLimitsConfig,
    load_risk_limits,
)
from trading_system.risk_management.position_sizing import PositionSizer, PositionSizeResult
from trading_system.risk_management.risk_manager import RiskManager
from trading_system.risk_management.stop_loss import compute_stop_loss_price, is_stop_triggered
from trading_system.risk_management.volatility_filter import VolatilityCheckResult, check_volatility

__all__ = [
    "AssetClassRiskLimits",
    "PortfolioRiskLimits",
    "RiskLimitsConfig",
    "load_risk_limits",
    "PositionSizer",
    "PositionSizeResult",
    "RiskManager",
    "compute_stop_loss_price",
    "is_stop_triggered",
    "VolatilityCheckResult",
    "check_volatility",
]
