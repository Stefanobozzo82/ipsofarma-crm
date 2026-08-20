"""Orchestratore del portfolio allocator: distribuisce il capitale tra asset class.

Due responsabilità distinte, entrambe rispetto al profilo di allocazione
attivo (`config/portfolio.yaml`, già validato contro i tetti di rischio del
modulo 3 al caricamento):

1. **Arbitraggio di budget** (`allocate`): il modulo 3 approva un segnale
   contro i limiti di rischio *per strumento/asset class*; qui si verifica
   in più che ci sia budget residuo nel *target di portafoglio* (che può
   essere più prudente del tetto di sicurezza) — e se più segnali BUY
   concorrono sullo stesso budget nella stessa asset class, si allocano in
   ordine di confidenza decrescente finché il budget non si esaurisce. Le
   vendite (SELL) riducono l'esposizione e non consumano mai budget: sono
   sempre lasciate passare.
2. **Ribilanciamento** (`check_rebalance`): confronta il peso attuale di
   ogni asset class con il suo target e segnala (`RebalanceAction`) quando
   lo scostamento supera `rebalance_threshold_pct` — indipendentemente da
   qualunque segnale in arrivo, perché il solo movimento dei prezzi può far
   scostare il portafoglio dal profilo scelto.
"""

from __future__ import annotations

from datetime import datetime, timezone

from trading_system.common.enums import AssetClass, SignalAction
from trading_system.common.logging_config import get_logger
from trading_system.common.models import AllocationDecision, RebalanceAction, RiskDecision
from trading_system.portfolio.config_loader import PortfolioConfig

logger = get_logger(__name__)

_ASSET_CLASSES = (AssetClass.EQUITY, AssetClass.ETF, AssetClass.CRYPTO)


class PortfolioAllocator:
    """Alloca il capitale tra asset class secondo il profilo di rischio attivo."""

    def __init__(self, config: PortfolioConfig) -> None:
        self._config = config

    def target_weights(self) -> dict[AssetClass, float]:
        """Pesi target (% dell'equity totale) del profilo di allocazione attivo."""
        profile = self._config.active()
        return {ac: profile.weight_for(ac) for ac in _ASSET_CLASSES}

    def current_weights(self, positions_value: dict[AssetClass, float], total_equity: float) -> dict[AssetClass, float]:
        """Pesi attuali (% dell'equity totale) dati i valori correnti delle posizioni per asset class."""
        if total_equity <= 0:
            return {ac: 0.0 for ac in _ASSET_CLASSES}
        return {ac: positions_value.get(ac, 0.0) / total_equity * 100.0 for ac in _ASSET_CLASSES}

    def available_budget(
        self,
        asset_class: AssetClass,
        positions_value: dict[AssetClass, float],
        total_equity: float,
    ) -> float:
        """Capitale (in valuta di conto) ancora allocabile su `asset_class` prima di raggiungere il target."""
        if total_equity <= 0:
            return 0.0
        target_value = total_equity * self.target_weights()[asset_class] / 100.0
        current_value = positions_value.get(asset_class, 0.0)
        return max(0.0, target_value - current_value)

    def allocate(
        self,
        decisions: list[RiskDecision],
        positions_value: dict[AssetClass, float],
        total_equity: float,
    ) -> list[AllocationDecision]:
        """Arbitra il budget di portafoglio tra le `RiskDecision` approvate dal modulo 3."""
        now = datetime.now(timezone.utc)
        results: list[AllocationDecision] = []

        buys_by_class: dict[AssetClass, list[RiskDecision]] = {ac: [] for ac in _ASSET_CLASSES}

        for decision in decisions:
            if not decision.approved:
                results.append(
                    AllocationDecision(
                        symbol=decision.symbol,
                        asset_class=decision.asset_class,
                        approved=False,
                        action=decision.action,
                        quantity=0.0,
                        original_quantity=0.0,
                        reason=f"Non idoneo per l'allocazione (già rifiutato dal risk management): {decision.reason}",
                        strategy_name=decision.strategy_name,
                        evaluated_at=now,
                    )
                )
            elif decision.action == SignalAction.SELL:
                results.append(
                    AllocationDecision(
                        symbol=decision.symbol,
                        asset_class=decision.asset_class,
                        approved=True,
                        action=SignalAction.SELL,
                        quantity=decision.quantity,
                        original_quantity=decision.quantity,
                        reason="Riduzione di esposizione: le vendite non consumano budget di portafoglio.",
                        strategy_name=decision.strategy_name,
                        evaluated_at=now,
                    )
                )
            else:
                buys_by_class.setdefault(decision.asset_class, []).append(decision)

        for asset_class, buy_decisions in buys_by_class.items():
            if not buy_decisions:
                continue
            remaining_budget = self.available_budget(asset_class, positions_value, total_equity)
            # Priorità ai segnali con confidenza più alta: a parità di budget
            # residuo, sono quelli con la motivazione più solida a valle
            # dello strategy engine.
            for decision in sorted(buy_decisions, key=lambda d: d.signal_confidence, reverse=True):
                if decision.entry_price is None or decision.entry_price <= 0.0:
                    results.append(
                        AllocationDecision(
                            symbol=decision.symbol,
                            asset_class=decision.asset_class,
                            approved=False,
                            action=decision.action,
                            quantity=0.0,
                            original_quantity=decision.quantity,
                            reason="RiskDecision approvata ma priva di un entry_price valido: allocazione rifiutata per sicurezza.",
                            strategy_name=decision.strategy_name,
                            evaluated_at=now,
                        )
                    )
                    continue

                position_value = decision.quantity * decision.entry_price
                if remaining_budget <= 0.0:
                    results.append(
                        AllocationDecision(
                            symbol=decision.symbol,
                            asset_class=decision.asset_class,
                            approved=False,
                            action=decision.action,
                            quantity=0.0,
                            original_quantity=decision.quantity,
                            reason=(
                                f"Budget di portafoglio per {asset_class.value} esaurito "
                                f"(target {self.target_weights()[asset_class]:.1f}% già raggiunto)."
                            ),
                            strategy_name=decision.strategy_name,
                            evaluated_at=now,
                        )
                    )
                    continue

                if position_value <= remaining_budget:
                    results.append(
                        AllocationDecision(
                            symbol=decision.symbol,
                            asset_class=decision.asset_class,
                            approved=True,
                            action=decision.action,
                            quantity=decision.quantity,
                            original_quantity=decision.quantity,
                            reason=(
                                f"Approvato per intero entro il budget di portafoglio residuo "
                                f"({remaining_budget:.2f} disponibili)."
                            ),
                            strategy_name=decision.strategy_name,
                            evaluated_at=now,
                        )
                    )
                    remaining_budget -= position_value
                else:
                    reduced_quantity = remaining_budget / decision.entry_price
                    results.append(
                        AllocationDecision(
                            symbol=decision.symbol,
                            asset_class=decision.asset_class,
                            approved=True,
                            action=decision.action,
                            quantity=reduced_quantity,
                            original_quantity=decision.quantity,
                            reason=(
                                f"Ridotto da {decision.quantity:.6f} a {reduced_quantity:.6f} per rispettare "
                                f"il budget di portafoglio residuo per {asset_class.value} ({remaining_budget:.2f})."
                            ),
                            strategy_name=decision.strategy_name,
                            evaluated_at=now,
                        )
                    )
                    remaining_budget = 0.0

        for result in results:
            logger.info(
                "Allocazione | symbol=%s asset_class=%s approved=%s quantity=%.6f (originale %.6f)",
                result.symbol, result.asset_class.value, result.approved, result.quantity, result.original_quantity,
            )
        return results

    def check_rebalance(
        self,
        positions_value: dict[AssetClass, float],
        total_equity: float,
    ) -> list[RebalanceAction]:
        """Segnala le asset class il cui peso attuale si scosta troppo dal target."""
        if total_equity <= 0:
            return []

        now = datetime.now(timezone.utc)
        targets = self.target_weights()
        currents = self.current_weights(positions_value, total_equity)
        threshold = self._config.rebalance_threshold_pct

        actions: list[RebalanceAction] = []
        for asset_class in _ASSET_CLASSES:
            current_pct = currents[asset_class]
            target_pct = targets[asset_class]
            drift = current_pct - target_pct

            if abs(drift) <= threshold:
                continue

            action = SignalAction.SELL if drift > 0 else SignalAction.BUY
            amount = abs(drift) / 100.0 * total_equity
            verb = "ridurre" if action == SignalAction.SELL else "aumentare"

            actions.append(
                RebalanceAction(
                    asset_class=asset_class,
                    action=action,
                    current_pct=current_pct,
                    target_pct=target_pct,
                    drift_pct=drift,
                    amount=amount,
                    reason=(
                        f"{asset_class.value}: peso attuale {current_pct:.1f}% vs target {target_pct:.1f}% "
                        f"(scostamento {drift:+.1f} punti, soglia {threshold:.1f}) => {verb} l'esposizione "
                        f"di circa {amount:.2f}."
                    ),
                    evaluated_at=now,
                )
            )

        actions.sort(key=lambda a: abs(a.drift_pct), reverse=True)
        for action in actions:
            logger.info(
                "Ribilanciamento suggerito | asset_class=%s action=%s drift=%.1f%%",
                action.asset_class.value, action.action.value, action.drift_pct,
            )
        return actions
