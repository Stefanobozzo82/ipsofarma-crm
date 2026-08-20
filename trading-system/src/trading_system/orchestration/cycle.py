"""Modulo 8 — Orchestrazione: un ciclo autonomo completo, senza supervisione umana.

Non introduce logica nuova nei moduli 1-6: li richiama nell'ordine già
stabilito dalla pipeline (dati -> segnali -> rischio -> allocazione ->
esecuzione), con due responsabilità aggiuntive proprie di un job non
presidiato:

1. **Resilienza per simbolo.** Un dato mancante, una fonte dati
   temporaneamente irraggiungibile o un errore imprevisto su un singolo
   simbolo vengono loggati e quel simbolo viene saltato — il ciclo continua
   con gli altri. Un job autonomo che si ferma per un problema isolato
   lascia il portafoglio scoperto fino al prossimo intervento umano, il che
   è peggio che saltare un simbolo per un giorno.
2. **Stato reale, non di esempio.** A differenza degli script demo in
   `scripts/` (che simulano un conto con equity fissa e nessuna posizione,
   per rendere leggibile la demo), qui cassa e posizioni vengono lette dal
   conto paper persistito (`ExecutionRepository`) ad ogni ciclo: è lo stesso
   conto che accumula lo storico necessario al periodo di validazione
   richiesto da `execution.gate.LiveTradingGate` prima di poter autorizzare
   il live.

Esegue sempre in base a `config/execution.yaml`: se `mode: paper` (default),
nessun ordine può mai raggiungere un broker reale, a prescindere da come
gira questo modulo. Se invece `mode: live`, ogni ordine passa comunque per
`execution.gate.LiveTradingGate`: qui `explicit_confirmation` è sempre
`False` (un ciclo non presidiato non può mai fornire una conferma umana a
runtime — per disegno, non un'omissione) — l'unico percorso verso il live
resta quindi il periodo di validazione in paper trading, con l'eleggibilità
letta da `eligibility_repo` (calcolata da un job separato, vedi
`orchestration.eligibility_cycle`). Un simbolo mai valutato (nessuna riga in
`eligibility_repo`) resta in paper: l'assenza di eleggibilità non autorizza
mai il live, non è un'astensione neutra.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import pandas as pd
import yaml

from config.settings import ASSETS_PATH
from trading_system.backtesting import EligibilityRepository
from trading_system.common.enums import AssetClass, OrderStatus, Timeframe
from trading_system.common.exceptions import DataSourceError
from trading_system.common.logging_config import get_logger
from trading_system.common.models import RiskDecision
from trading_system.data_ingestion import CryptoCCXTSource, EquityYFinanceSource, MarketDataRepository
from trading_system.data_ingestion.storage import MarketBarORM
from trading_system.execution import ExecutionManager
from trading_system.portfolio import PortfolioAllocator
from trading_system.risk_management import RiskManager
from trading_system.strategy_engine import StrategyEngine

logger = get_logger(__name__)

_ASSET_CLASS_SECTIONS = ((AssetClass.EQUITY, "equity"), (AssetClass.ETF, "etf"), (AssetClass.CRYPTO, "crypto"))


@dataclass
class CycleReport:
    """Esito di un ciclo — prodotto sempre, anche se qualche simbolo è stato saltato."""

    started_at: datetime
    finished_at: datetime
    symbols_processed: int = 0
    symbols_skipped: list[str] = field(default_factory=list)
    orders_filled: int = 0
    orders_rejected: int = 0
    cash_after: float = 0.0
    total_equity_after: float = 0.0
    errors: list[str] = field(default_factory=list)


def load_watchlist() -> dict:
    with open(ASSETS_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _bars_to_dataframe(rows: list[MarketBarORM]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["timestamp", "close"])
    return pd.DataFrame([{"timestamp": r.timestamp, "close": r.close} for r in rows]).sort_values("timestamp")


def _fetch_fresh_data(data_repo: MarketDataRepository, watchlist: dict, lookback_days: int) -> list[str]:
    """Scarica ed effettua l'upsert dei dati più recenti per l'intera watchlist.

    Un simbolo la cui fonte dati fallisce viene loggato e la sua raccolta
    saltata: ritorna l'elenco dei simboli non aggiornati in questo ciclo, non
    solleva mai un'eccezione che fermerebbe l'intero job.
    """
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    skipped: list[str] = []

    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)
    for item in watchlist.get("equity", []):
        symbol = item["symbol"]
        try:
            data_repo.upsert_bars(equity_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1))
        except DataSourceError as exc:
            logger.warning("Dati equity non disponibili per %s, salto: %s", symbol, exc)
            skipped.append(symbol)

    etf_source = EquityYFinanceSource(asset_class=AssetClass.ETF)
    for item in watchlist.get("etf", []):
        symbol = item["symbol"]
        try:
            data_repo.upsert_bars(etf_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1))
        except DataSourceError as exc:
            logger.warning("Dati ETF non disponibili per %s, salto: %s", symbol, exc)
            skipped.append(symbol)

    by_exchange: dict[str, list[str]] = {}
    for item in watchlist.get("crypto", []):
        by_exchange.setdefault(item.get("exchange", "kraken"), []).append(item["symbol"])
    for exchange_id, symbols in by_exchange.items():
        crypto_source = CryptoCCXTSource(exchange_id=exchange_id)
        for symbol in symbols:
            try:
                data_repo.upsert_bars(crypto_source.get_historical_bars(symbol, start, end, Timeframe.DAY_1))
            except DataSourceError as exc:
                logger.warning("Dati crypto non disponibili per %s su %s, salto: %s", symbol, exchange_id, exc)
                skipped.append(symbol)

    return skipped


def _positions_snapshot(
    execution_manager: ExecutionManager, data_repo: MarketDataRepository,
) -> tuple[dict[AssetClass, float], float]:
    """Valorizza le posizioni correnti ai prezzi storicizzati più recenti.

    Ritorna (valore per asset class, equity totale = cassa + posizioni). Una
    posizione senza prezzo storicizzato viene esclusa dalla valorizzazione
    (loggato) piuttosto che far fallire l'intero ciclo.
    """
    value_by_class: dict[AssetClass, float] = {ac: 0.0 for ac, _ in _ASSET_CLASS_SECTIONS}
    for position in execution_manager.paper_broker.get_positions():
        bars = _bars_to_dataframe(data_repo.get_bars(position.symbol, position.asset_class, Timeframe.DAY_1))
        if bars.empty:
            logger.warning(
                "Nessun prezzo storicizzato per valorizzare %s (%s): escluso dall'equity di questo ciclo.",
                position.symbol, position.asset_class.value,
            )
            continue
        value_by_class[position.asset_class] += float(bars["close"].iloc[-1]) * position.quantity

    cash = execution_manager.paper_broker.get_cash()
    return value_by_class, cash + sum(value_by_class.values())


def run_cycle(
    data_repo: MarketDataRepository,
    execution_manager: ExecutionManager,
    risk_manager: RiskManager,
    portfolio_allocator: PortfolioAllocator,
    strategy_engine: StrategyEngine,
    eligibility_repo: EligibilityRepository | None = None,
    lookback_days: int = 30,
) -> CycleReport:
    """Esegue un ciclo completo: dati -> segnali -> rischio -> allocazione -> esecuzione (paper).

    Mai un'eccezione per un problema isolato su un simbolo: loggato,
    saltato, si continua con gli altri — coerente con un job non
    supervisionato che deve restare operativo il giorno dopo anche se un
    singolo strumento ha avuto un problema oggi.
    """
    started_at = datetime.now(timezone.utc)
    report = CycleReport(started_at=started_at, finished_at=started_at)

    watchlist = load_watchlist()
    report.symbols_skipped.extend(_fetch_fresh_data(data_repo, watchlist, lookback_days))

    equity_source = EquityYFinanceSource(asset_class=AssetClass.EQUITY)
    positions_value, account_equity = _positions_snapshot(execution_manager, data_repo)
    all_decisions: list[RiskDecision] = []

    for asset_class, section in _ASSET_CLASS_SECTIONS:
        exposure_pct = (
            positions_value.get(asset_class, 0.0) / account_equity * 100.0 if account_equity > 0 else 0.0
        )
        for item in watchlist.get(section, []):
            symbol = item["symbol"]
            if symbol in report.symbols_skipped:
                continue
            try:
                bars = _bars_to_dataframe(data_repo.get_bars(symbol, asset_class, Timeframe.DAY_1))
                if bars.empty:
                    logger.warning("Nessun dato storicizzato per %s, salto questo ciclo.", symbol)
                    report.symbols_skipped.append(symbol)
                    continue

                context = {}
                if asset_class == AssetClass.EQUITY:
                    try:
                        context["fundamentals"] = equity_source.get_fundamentals(symbol)
                    except DataSourceError as exc:
                        logger.warning("Fondamentali non disponibili per %s: %s", symbol, exc)

                for signal in strategy_engine.generate_signals(symbol, asset_class, bars, **context):
                    decision = risk_manager.evaluate_signal(
                        signal, bars, account_equity=account_equity, current_asset_class_exposure_pct=exposure_pct,
                    )
                    all_decisions.append(decision)
                report.symbols_processed += 1
            except Exception as exc:  # noqa: BLE001 — un ciclo autonomo non deve mai fermarsi per un simbolo
                logger.exception("Errore imprevisto elaborando %s (%s): salto e continuo.", symbol, asset_class.value)
                report.symbols_skipped.append(symbol)
                report.errors.append(f"{symbol}: {exc}")

    for allocation in portfolio_allocator.allocate(all_decisions, positions_value, account_equity):
        eligibility = (
            eligibility_repo.get_latest(allocation.symbol, allocation.strategy_name)
            if eligibility_repo is not None
            else None
        )
        # explicit_confirmation è sempre False: un ciclo non presidiato non può mai
        # fornire una conferma umana a runtime — l'unico percorso verso il live è
        # il periodo di validazione in paper trading (vedi il docstring del modulo).
        order = execution_manager.execute(allocation, eligibility=eligibility, explicit_confirmation=False)
        if order.status == OrderStatus.FILLED:
            report.orders_filled += 1
        elif order.status == OrderStatus.REJECTED and allocation.approved:
            # Un ordine rifiutato dal broker (es. cassa insufficiente), non un HOLD/non-approvato a monte.
            report.orders_rejected += 1

    _, final_equity = _positions_snapshot(execution_manager, data_repo)
    report.cash_after = execution_manager.paper_broker.get_cash()
    report.total_equity_after = final_equity
    report.finished_at = datetime.now(timezone.utc)

    logger.info(
        "Ciclo completato | simboli_elaborati=%d simboli_saltati=%d ordini_filled=%d ordini_rejected=%d "
        "cassa=%.2f equity_totale=%.2f durata=%s",
        report.symbols_processed, len(report.symbols_skipped), report.orders_filled, report.orders_rejected,
        report.cash_after, report.total_equity_after, report.finished_at - report.started_at,
    )
    return report
