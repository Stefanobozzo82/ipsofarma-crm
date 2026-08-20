"""Persistenza dell'execution layer: storico ordini (paper e live) e stato del conto paper.

Schema separato da quello del modulo 1 (`data_ingestion.storage`), stesso
principio (SQLAlchemy, SQLite di default) — può convivere nello stesso file
`.db`, ogni modulo gestisce le proprie tabelle.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Engine, Float, String, UniqueConstraint, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from trading_system.common.enums import AssetClass, ExecutionMode, OrderStatus
from trading_system.common.logging_config import get_logger
from trading_system.common.models import Order

logger = get_logger(__name__)


class Base(DeclarativeBase):
    pass


class OrderORM(Base):
    """Storico di ogni ordine, paper o live, per tracciabilità completa."""

    __tablename__ = "execution_orders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    asset_class: Mapped[str] = mapped_column(String(16), index=True)
    side: Mapped[str] = mapped_column(String(8))
    quantity: Mapped[float] = mapped_column(Float)
    mode: Mapped[str] = mapped_column(String(8), index=True)
    broker: Mapped[str] = mapped_column(String(32))
    strategy_name: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(String(1024))
    filled_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class PaperAccountORM(Base):
    """Riga singola (id=1) con lo stato di cassa del conto paper."""

    __tablename__ = "paper_account"

    id: Mapped[int] = mapped_column(primary_key=True)
    cash: Mapped[float] = mapped_column(Float)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PaperPositionORM(Base):
    """Posizioni correnti del conto paper."""

    __tablename__ = "paper_positions"
    __table_args__ = (UniqueConstraint("symbol", name="uq_paper_position_symbol"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    asset_class: Mapped[str] = mapped_column(String(16))
    quantity: Mapped[float] = mapped_column(Float)
    average_entry_price: Mapped[float] = mapped_column(Float)


def create_sqlite_engine(database_url: str) -> Engine:
    """Crea l'engine SQLAlchemy e assicura che lo schema dell'execution layer esista."""
    engine = create_engine(database_url, future=True)
    Base.metadata.create_all(engine)
    return engine


_PAPER_ACCOUNT_ID = 1


def _as_utc(value: datetime | None) -> datetime | None:
    """SQLite non conserva il timezone: ogni datetime letto dal DB torna naive.

    Li salviamo sempre come UTC (vedi `Order`/`common.models`, sempre
    timezone-aware), quindi al rientro possiamo riattaccare `tzinfo=UTC` in
    sicurezza — senza questo, confrontare un timestamp letto dal DB con
    `datetime.now(timezone.utc)` (es. in `execution.gate`) solleva
    `TypeError: can't subtract offset-naive and offset-aware datetimes`.
    """
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


class ExecutionRepository:
    """Repository per lo storico ordini e lo stato del conto paper."""

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self._session_factory: sessionmaker[Session] = sessionmaker(bind=engine, future=True)

    # --- Storico ordini (paper e live) --------------------------------------

    def record_order(self, order: Order) -> None:
        with self._session_factory() as session:
            session.add(
                OrderORM(
                    symbol=order.symbol,
                    asset_class=order.asset_class.value,
                    side=order.side.value,
                    quantity=order.quantity,
                    mode=order.mode.value,
                    broker=order.broker,
                    strategy_name=order.strategy_name,
                    status=order.status.value,
                    reason=order.reason,
                    filled_price=order.filled_price,
                    filled_at=order.filled_at,
                    created_at=order.created_at,
                )
            )
            session.commit()

    def list_orders(self, symbol: str | None = None, mode: ExecutionMode | None = None) -> list[OrderORM]:
        """Nota: `created_at`/`filled_at` sui risultati sono naive (round-trip SQLite,
        vedi `_as_utc`) — se ti servono per aritmetica con `datetime.now(timezone.utc)`,
        passali per `_as_utc()` prima di usarli."""
        with self._session_factory() as session:
            stmt = select(OrderORM).order_by(OrderORM.created_at)
            if symbol is not None:
                stmt = stmt.where(OrderORM.symbol == symbol)
            if mode is not None:
                stmt = stmt.where(OrderORM.mode == mode.value)
            return list(session.execute(stmt).scalars().all())

    def get_validation_stats(self, symbol: str, strategy_name: str) -> tuple[int, datetime | None]:
        """(numero di trade paper riempiti, timestamp del primo) per `symbol`+`strategy_name`.

        Usato da `execution.gate.LiveTradingGate` per il percorso "periodo di
        validazione superato" verso il live.
        """
        with self._session_factory() as session:
            stmt = (
                select(OrderORM)
                .where(
                    OrderORM.symbol == symbol,
                    OrderORM.strategy_name == strategy_name,
                    OrderORM.mode == ExecutionMode.PAPER.value,
                    OrderORM.status == OrderStatus.FILLED.value,
                )
                .order_by(OrderORM.created_at)
            )
            rows = list(session.execute(stmt).scalars().all())
            if not rows:
                return 0, None
            return len(rows), _as_utc(rows[0].created_at)

    # --- Conto paper: cassa --------------------------------------------------

    def ensure_paper_account(self, initial_cash: float) -> float:
        """Crea il conto paper con `initial_cash` se non esiste già; ritorna la cassa attuale."""
        with self._session_factory() as session:
            account = session.get(PaperAccountORM, _PAPER_ACCOUNT_ID)
            if account is None:
                account = PaperAccountORM(
                    id=_PAPER_ACCOUNT_ID, cash=initial_cash, updated_at=datetime.now(timezone.utc)
                )
                session.add(account)
                session.commit()
                return initial_cash
            return account.cash

    def get_cash(self) -> float:
        with self._session_factory() as session:
            account = session.get(PaperAccountORM, _PAPER_ACCOUNT_ID)
            if account is None:
                raise RuntimeError("Conto paper non inizializzato: chiama ensure_paper_account() prima.")
            return account.cash

    def set_cash(self, value: float) -> None:
        with self._session_factory() as session:
            account = session.get(PaperAccountORM, _PAPER_ACCOUNT_ID)
            if account is None:
                raise RuntimeError("Conto paper non inizializzato: chiama ensure_paper_account() prima.")
            account.cash = value
            account.updated_at = datetime.now(timezone.utc)
            session.commit()

    # --- Conto paper: posizioni -----------------------------------------------

    def get_position(self, symbol: str) -> PaperPositionORM | None:
        with self._session_factory() as session:
            stmt = select(PaperPositionORM).where(PaperPositionORM.symbol == symbol)
            return session.execute(stmt).scalar_one_or_none()

    def get_positions(self) -> list[PaperPositionORM]:
        with self._session_factory() as session:
            return list(session.execute(select(PaperPositionORM)).scalars().all())

    def add_to_position(self, symbol: str, asset_class: AssetClass, quantity: float, price: float) -> None:
        """Aumenta (o apre) una posizione, ricalcolando il prezzo medio di carico."""
        with self._session_factory() as session:
            stmt = select(PaperPositionORM).where(PaperPositionORM.symbol == symbol)
            position = session.execute(stmt).scalar_one_or_none()
            if position is None:
                session.add(
                    PaperPositionORM(
                        symbol=symbol, asset_class=asset_class.value, quantity=quantity, average_entry_price=price,
                    )
                )
            else:
                total_cost = position.quantity * position.average_entry_price + quantity * price
                position.quantity += quantity
                position.average_entry_price = total_cost / position.quantity
            session.commit()

    def reduce_position(self, symbol: str, quantity: float) -> None:
        """Riduce una posizione; la rimuove se la quantità residua è (circa) zero."""
        with self._session_factory() as session:
            stmt = select(PaperPositionORM).where(PaperPositionORM.symbol == symbol)
            position = session.execute(stmt).scalar_one_or_none()
            if position is None:
                logger.warning("reduce_position chiamata su %s senza posizione esistente: ignorato.", symbol)
                return
            position.quantity -= quantity
            if position.quantity <= 1e-9:
                session.delete(position)
            session.commit()
