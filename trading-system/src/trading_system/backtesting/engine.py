"""Motore di backtest walk-forward.

Decisione architetturale: invece di reimplementare le strategie dentro un
motore esterno (backtrader/vectorbt, citati nello stack ma con un modello a
oggetti pensato per possedere l'intera logica di trading), questo motore
orchestra **le stesse istanze** di `StrategyEngine` (modulo 2) e
`RiskManager` (modulo 3) che opererebbero dal vivo. Backtestare una
reimplementazione parallela della strategia non garantirebbe che "backtest
positivo" dica qualcosa sulla logica che poi opera davvero — è la ragione
d'essere di questo modulo, per vincolo di prodotto.

Ad ogni barra, il motore vede solo `bars.iloc[:i+1]` (nessun look-ahead):
la finestra passata alle strategie è esattamente quella che vedrebbero se
girassero quel giorno in produzione.

**Ambito attuale: long-only.** Un segnale BUY apre una posizione lunga; un
segnale SELL la chiude (o viene ignorato se non c'è nulla da chiudere — non
si aprono posizioni corte). Vendite allo scoperto non sono modellate: è una
scelta deliberata coerente con l'impostazione "a basso rischio" del
prodotto, non una lacuna del motore.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import pandas as pd

from trading_system.backtesting import metrics
from trading_system.backtesting.config_loader import BacktestingConfig
from trading_system.common.enums import AssetClass, OrderSide, SignalAction
from trading_system.common.logging_config import get_logger
from trading_system.common.models import BacktestResult, BacktestTrade
from trading_system.risk_management.risk_manager import RiskManager
from trading_system.strategy_engine.engine import StrategyEngine

logger = get_logger(__name__)

#: Periodi/anno per l'annualizzazione delle metriche, per asset class
#: (crypto tratta 365 giorni/anno, azioni/ETF ~252 sedute/anno — stessa
#: convenzione già usata dagli indicatori del modulo 2).
_PERIODS_PER_YEAR = {
    AssetClass.CRYPTO: 365,
    AssetClass.EQUITY: 252,
    AssetClass.ETF: 252,
}


@dataclass
class _OpenPosition:
    entry_at: datetime
    entry_price: float
    quantity: float
    stop_loss_price: float
    entry_commission: float


@dataclass
class BacktestRun:
    """Esito completo di un backtest: metriche (`result`) più la curva di equity.

    `equity_curve` non è nel modello pydantic `BacktestResult` (pensato per
    essere serializzato/loggato) per non appesantirlo con una serie
    temporale: resta disponibile qui per l'aggregazione (`aggregate.py`) o
    per un futuro grafico nella dashboard (modulo 7).
    """

    result: BacktestResult
    equity_curve: pd.Series


class BacktestEngine:
    """Esegue un backtest walk-forward per un singolo simbolo, usando strategy engine + risk manager reali."""

    def __init__(
        self,
        config: BacktestingConfig,
        strategy_engine: StrategyEngine,
        risk_manager: RiskManager,
        warmup_bars: int = 60,
    ) -> None:
        self._config = config
        self._strategy_engine = strategy_engine
        self._risk_manager = risk_manager
        self._warmup_bars = warmup_bars

    def run(
        self,
        symbol: str,
        asset_class: AssetClass,
        bars: pd.DataFrame,
        fundamentals: dict | None = None,
    ) -> BacktestRun:
        bars = bars.sort_values("timestamp").reset_index(drop=True)
        if len(bars) <= self._warmup_bars:
            raise ValueError(
                f"Dati insufficienti per il backtest di {symbol}: servono più di "
                f"{self._warmup_bars} barre, disponibili {len(bars)}."
            )

        context = {"fundamentals": fundamentals} if fundamentals is not None else {}
        cash = self._config.initial_equity
        position: _OpenPosition | None = None
        trades: list[BacktestTrade] = []
        equity_index: list[pd.Timestamp] = []
        equity_values: list[float] = []

        for i in range(self._warmup_bars, len(bars)):
            window = bars.iloc[: i + 1]
            today = window.iloc[-1]
            today_ts = pd.Timestamp(today["timestamp"])
            today_close = float(today["close"])
            today_low = float(today["low"]) if "low" in today and pd.notna(today["low"]) else today_close

            if position is not None:
                if today_low <= position.stop_loss_price:
                    exit_price = position.stop_loss_price * (1.0 - self._config.slippage_pct / 100.0)
                    cash += self._close_position(symbol, asset_class, position, exit_price, today_ts, "stop_loss", trades)
                    position = None
                else:
                    signals = self._strategy_engine.generate_signals(symbol, asset_class, window, **context)
                    if any(s.action == SignalAction.SELL for s in signals):
                        exit_price = today_close * (1.0 - self._config.slippage_pct / 100.0)
                        cash += self._close_position(symbol, asset_class, position, exit_price, today_ts, "segnale_sell", trades)
                        position = None
                    # BUY o HOLD mentre già in posizione: nessuna azione (niente piramidazione).
            else:
                signals = self._strategy_engine.generate_signals(symbol, asset_class, window, **context)
                buy_signal = next((s for s in signals if s.action == SignalAction.BUY), None)
                if buy_signal is not None:
                    decision = self._risk_manager.evaluate_signal(buy_signal, window, account_equity=cash)
                    if decision.approved and decision.quantity > 0 and decision.stop_loss_price:
                        entry_price = today_close * (1.0 + self._config.slippage_pct / 100.0)
                        cost = decision.quantity * entry_price
                        commission = cost * self._config.commission_pct / 100.0
                        if cost + commission <= cash:
                            cash -= cost + commission
                            position = _OpenPosition(
                                entry_at=today_ts,
                                entry_price=entry_price,
                                quantity=decision.quantity,
                                stop_loss_price=decision.stop_loss_price,
                                entry_commission=commission,
                            )
                        else:
                            logger.info(
                                "Backtest %s: segnale BUY approvato ma cassa insufficiente per costo+commissione (%.2f > %.2f), ignorato.",
                                symbol, cost + commission, cash,
                            )

            mark_to_market = cash + (position.quantity * today_close if position is not None else 0.0)
            equity_index.append(today_ts)
            equity_values.append(mark_to_market)

        if position is not None:
            last_row = bars.iloc[-1]
            exit_price = float(last_row["close"])
            exit_ts = pd.Timestamp(last_row["timestamp"])
            cash += self._close_position(symbol, asset_class, position, exit_price, exit_ts, "fine_periodo", trades)
            equity_values[-1] = cash

        equity_curve = pd.Series(equity_values, index=pd.DatetimeIndex(equity_index), name="equity")
        result = self._build_result(symbol, asset_class, trades, equity_curve)
        return BacktestRun(result=result, equity_curve=equity_curve)

    def _close_position(
        self,
        symbol: str,
        asset_class: AssetClass,
        position: _OpenPosition,
        exit_price: float,
        exit_at: pd.Timestamp,
        exit_reason: str,
        trades: list[BacktestTrade],
    ) -> float:
        """Chiude una posizione: registra il trade e ritorna la cassa liberata."""
        exit_commission = position.quantity * exit_price * self._config.commission_pct / 100.0
        proceeds = position.quantity * exit_price - exit_commission
        cost_basis = position.quantity * position.entry_price + position.entry_commission
        pnl = proceeds - cost_basis
        pnl_pct = (pnl / cost_basis * 100.0) if cost_basis > 0 else 0.0

        trades.append(
            BacktestTrade(
                symbol=symbol,
                asset_class=asset_class,
                side=OrderSide.BUY,
                entry_at=position.entry_at.to_pydatetime(),
                entry_price=position.entry_price,
                exit_at=exit_at.to_pydatetime(),
                exit_price=exit_price,
                quantity=position.quantity,
                pnl=pnl,
                pnl_pct=pnl_pct,
                exit_reason=exit_reason,
            )
        )
        return proceeds

    def _build_result(
        self,
        symbol: str,
        asset_class: AssetClass,
        trades: list[BacktestTrade],
        equity_curve: pd.Series,
    ) -> BacktestResult:
        strategies = self._strategy_engine.strategies_for(asset_class)
        strategy_name = strategies[0].name if strategies else "sconosciuta"
        periods_per_year = _PERIODS_PER_YEAR.get(asset_class, 252)

        result = BacktestResult(
            symbol=symbol,
            asset_class=asset_class,
            strategy_name=strategy_name,
            start_at=equity_curve.index[0].to_pydatetime(),
            end_at=equity_curve.index[-1].to_pydatetime(),
            initial_equity=self._config.initial_equity,
            final_equity=float(equity_curve.iloc[-1]),
            total_return_pct=metrics.total_return_pct(equity_curve),
            cagr_pct=metrics.cagr_pct(equity_curve, periods_per_year=periods_per_year),
            max_drawdown_pct=metrics.max_drawdown_pct(equity_curve),
            sharpe_ratio=metrics.sharpe_ratio(equity_curve, periods_per_year=periods_per_year),
            win_rate_pct=metrics.win_rate_pct(trades),
            num_trades=len(trades),
            trades=trades,
            generated_at=datetime.now(timezone.utc),
        )
        logger.info(
            "Backtest completato | symbol=%s asset_class=%s trades=%d total_return=%.2f%% "
            "max_drawdown=%.2f%% sharpe=%.2f",
            symbol, asset_class.value, result.num_trades, result.total_return_pct,
            result.max_drawdown_pct, result.sharpe_ratio,
        )
        return result
