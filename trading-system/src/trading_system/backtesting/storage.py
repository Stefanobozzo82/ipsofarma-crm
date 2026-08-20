"""Persistenza dell'eleggibilità al trading live (modulo 5).

Un backtest walk-forward su uno storico lungo (mesi/anni) è costoso da
rifare ad ogni ciclo di trading: viene calcolato da un job separato a
cadenza più bassa (vedi `trading_system.orchestration.eligibility_cycle`,
tipicamente settimanale) e persistito qui. Il ciclo di trading quotidiano
(`orchestration.cycle.run_cycle`) legge solo l'ultima eleggibilità nota per
simbolo/strategia — è quella che `execution.gate.LiveTradingGate` consulta
per decidere se un ordine può passare al live.

Insert-only per disegno: ogni valutazione resta come riga separata (stesso
principio di auditabilità già usato per lo storico ordini) — `get_latest`
legge semplicemente la più recente per `symbol`+`strategy_name`.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Engine, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from trading_system.common.enums import AssetClass
from trading_system.common.models import BacktestEligibility


class Base(DeclarativeBase):
    pass


class BacktestEligibilityORM(Base):
    """Riga di una valutazione di eleggibilità, storicizzata (mai sovrascritta)."""

    __tablename__ = "backtest_eligibility"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    asset_class: Mapped[str] = mapped_column(String(16))
    strategy_name: Mapped[str] = mapped_column(String(64), index=True)
    approved: Mapped[bool] = mapped_column(Boolean)
    reason: Mapped[str] = mapped_column(String(2000))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


def create_sqlite_engine(database_url: str) -> Engine:
    """Vedi `data_ingestion.storage.create_sqlite_engine` per il motivo dello StaticPool su `:memory:`."""
    kwargs = {}
    if ":memory:" in database_url:
        kwargs = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
    engine = create_engine(database_url, future=True, **kwargs)
    Base.metadata.create_all(engine)
    return engine


def _as_utc(value: datetime | None) -> datetime | None:
    """SQLite non conserva il timezone: un datetime letto dal DB torna naive.

    Lo salviamo sempre come UTC, quindi possiamo riattaccare `tzinfo=UTC` in
    sicurezza al rientro — senza questo, `LiveTradingGate` (che confronta
    `evaluated_at` con `datetime.now(timezone.utc)`) solleverebbe TypeError.
    """
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


class EligibilityRepository:
    """Repository per la persistenza/lettura delle valutazioni di eleggibilità."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self._session_factory: sessionmaker[Session] = sessionmaker(bind=engine, future=True)

    def save(self, eligibility: BacktestEligibility) -> None:
        with self._session_factory() as session:
            session.add(
                BacktestEligibilityORM(
                    symbol=eligibility.symbol,
                    asset_class=eligibility.asset_class.value,
                    strategy_name=eligibility.strategy_name,
                    approved=eligibility.approved,
                    reason=eligibility.reason,
                    evaluated_at=eligibility.evaluated_at,
                )
            )
            session.commit()

    def get_latest(self, symbol: str, strategy_name: str) -> BacktestEligibility | None:
        """Ritorna la valutazione più recente per `symbol`+`strategy_name`, o `None` se mai valutato."""
        with self._session_factory() as session:
            stmt = (
                select(BacktestEligibilityORM)
                .where(
                    BacktestEligibilityORM.symbol == symbol,
                    BacktestEligibilityORM.strategy_name == strategy_name,
                )
                .order_by(BacktestEligibilityORM.evaluated_at.desc())
                .limit(1)
            )
            row = session.execute(stmt).scalar_one_or_none()
            if row is None:
                return None
            return BacktestEligibility(
                symbol=row.symbol,
                asset_class=AssetClass(row.asset_class),
                strategy_name=row.strategy_name,
                approved=row.approved,
                reason=row.reason,
                evaluated_at=_as_utc(row.evaluated_at),
            )
