"""Filtro che esclude asset sopra soglia di volatilità/rischio per categoria.

È un controllo indipendente da quello (opzionale) che alcune strategie
applicano già internamente (es. `RSIVolatilityStrategy` per le crypto,
modulo 2): quello è parte della *logica di trading* di una strategia
specifica e può essere disattivato/ricalibrato in `config/strategies.yaml`
senza toccare il rischio. Questo è invece un floor di rischio *di
portafoglio*, valido a prescindere da quale strategia ha generato il
segnale, letto da `config/risk_limits.yaml`: anche se una strategia non
applica un proprio filtro di volatilità, questo controllo si applica
comunque prima che qualunque ordine possa partire.
"""

from __future__ import annotations

import pandas as pd

from trading_system.risk_management.config_loader import AssetClassRiskLimits
from trading_system.strategy_engine.indicators import annualized_volatility


class VolatilityCheckResult:
    """Esito del filtro di volatilità: passato o meno, con motivazione e valore misurato."""

    def __init__(self, passed: bool, reason: str, measured_volatility: float | None):
        self.passed = passed
        self.reason = reason
        self.measured_volatility = measured_volatility

    def __repr__(self) -> str:  # pragma: no cover - solo per debug/log
        return f"VolatilityCheckResult(passed={self.passed}, measured={self.measured_volatility}, reason={self.reason!r})"


def check_volatility(
    bars: pd.DataFrame,
    limits: AssetClassRiskLimits,
    window: int = 20,
) -> VolatilityCheckResult:
    """Verifica che la volatilità annualizzata recente sia entro il limite di `limits`.

    Richiede almeno `window + 1` barre; se i dati sono insufficienti il
    controllo **non passa** (fail-safe: dati insufficienti non equivalgono a
    rischio basso).
    """
    if len(bars) < window + 1:
        return VolatilityCheckResult(
            passed=False,
            reason=f"Dati insufficienti per calcolare la volatilità (servono almeno {window + 1} barre, disponibili {len(bars)}).",
            measured_volatility=None,
        )

    vol_series = annualized_volatility(bars["close"], window=window)
    last_vol = vol_series.iloc[-1]

    if pd.isna(last_vol):
        return VolatilityCheckResult(
            passed=False,
            reason="Volatilità non calcolabile sui dati disponibili.",
            measured_volatility=None,
        )

    if last_vol > limits.max_volatility_annualized:
        return VolatilityCheckResult(
            passed=False,
            reason=(
                f"Volatilità annualizzata {last_vol:.1%} supera il limite di rischio "
                f"{limits.max_volatility_annualized:.1%} per questa asset class: asset escluso."
            ),
            measured_volatility=float(last_vol),
        )

    return VolatilityCheckResult(
        passed=True,
        reason=(
            f"Volatilità annualizzata {last_vol:.1%} entro il limite "
            f"{limits.max_volatility_annualized:.1%}."
        ),
        measured_volatility=float(last_vol),
    )
