"""Position sizing: quanto capitale allocare su un singolo segnale approvato.

Formula "risk-based": si parte da quanto capitale si è disposti a perdere
su un singolo trade se lo stop-loss scatta (`risk_per_trade_pct`
dell'equity, scalato dalla confidenza del segnale), e si deriva la
dimensione della posizione dalla distanza dello stop-loss. Il risultato è
poi vincolato dai limiti per-strumento e per-asset-class letti da
`config/risk_limits.yaml`:

    position_value = min(
        risk_amount / stop_loss_pct,       # quanto serve per rischiare esattamente risk_amount
        equity * max_position_pct,          # tetto per singolo strumento
        equity * (max_portfolio_pct - esposizione attuale sull'asset class),  # tetto di portafoglio
    )

Questo modulo non decide *se* un segnale è autorizzato (quello è
`risk_manager.RiskManager`, che orchestra anche il filtro di volatilità e lo
stop-loss): calcola solo la size, assumendo che il segnale sia già stato
approvato.
"""

from __future__ import annotations

from trading_system.risk_management.config_loader import AssetClassRiskLimits


class PositionSizeResult:
    """Esito del dimensionamento: quantità, valore, e motivazione di quale vincolo ha deciso."""

    def __init__(self, quantity: float, position_value: float, reason: str):
        self.quantity = quantity
        self.position_value = position_value
        self.reason = reason

    def __repr__(self) -> str:  # pragma: no cover - solo per debug/log
        return f"PositionSizeResult(quantity={self.quantity}, position_value={self.position_value}, reason={self.reason!r})"


class PositionSizer:
    """Calcola la size di una posizione in base a rischio, confidenza e limiti."""

    def __init__(self, risk_per_trade_pct: float = 1.0) -> None:
        if not 0 < risk_per_trade_pct <= 100:
            raise ValueError("risk_per_trade_pct deve essere in (0, 100]")
        self.risk_per_trade_pct = risk_per_trade_pct

    def size_position(
        self,
        account_equity: float,
        entry_price: float,
        confidence: float,
        limits: AssetClassRiskLimits,
        current_asset_class_exposure_pct: float = 0.0,
    ) -> PositionSizeResult:
        if account_equity <= 0:
            return PositionSizeResult(0.0, 0.0, "Equity del conto non positiva: nessuna posizione possibile.")
        if entry_price <= 0:
            raise ValueError("entry_price deve essere positivo")
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence deve essere in [0, 1]")

        if confidence == 0.0:
            return PositionSizeResult(0.0, 0.0, "Confidenza del segnale nulla: nessuna posizione aperta.")

        risk_amount = account_equity * (self.risk_per_trade_pct / 100.0) * confidence
        risk_based_value = risk_amount / (limits.stop_loss_pct / 100.0)

        per_instrument_cap = account_equity * (limits.max_position_pct / 100.0)

        remaining_portfolio_pct = max(0.0, limits.max_portfolio_pct - current_asset_class_exposure_pct)
        portfolio_cap = account_equity * (remaining_portfolio_pct / 100.0)

        if portfolio_cap <= 0.0:
            return PositionSizeResult(
                0.0, 0.0,
                f"Esposizione già al limite di portafoglio per questa asset class "
                f"({current_asset_class_exposure_pct:.1f}% >= {limits.max_portfolio_pct:.1f}%): nessuna nuova posizione.",
            )

        candidates = {
            "rischio per trade": risk_based_value,
            "limite per strumento": per_instrument_cap,
            "limite di portafoglio per asset class": portfolio_cap,
        }
        binding_label = min(candidates, key=candidates.get)
        position_value = candidates[binding_label]
        quantity = position_value / entry_price

        reason = (
            f"Position size vincolata da '{binding_label}' "
            f"(rischio/trade={risk_based_value:.2f}, cap strumento={per_instrument_cap:.2f}, "
            f"cap portafoglio={portfolio_cap:.2f}) => valore posizione {position_value:.2f}, "
            f"quantità {quantity:.6f} a prezzo {entry_price:.4f}."
        )
        return PositionSizeResult(quantity, position_value, reason)
