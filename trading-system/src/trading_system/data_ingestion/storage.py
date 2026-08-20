"""Persistenza delle barre di mercato normalizzate.

SQLite di default (file locale in `data/trading_system.db`), Postgres se
`DATABASE_URL` è impostato (vedi `config.settings`). Lo schema è identico
per tutte le asset class: la tabella non distingue azioni da crypto se non
per il campo `asset_class`, in linea con l'approccio "stesso linguaggio,
fonti diverse" del resto del modulo.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    DateTime,
    Engine,
    Float,
    String,
    UniqueConstraint,
    create_engine,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from trading_system.common.enums import AssetClass, Timeframe
from trading_system.common.logging_config import get_logger
from trading_system.common.models import MarketBar

logger = get_logger(__name__)


class Base(DeclarativeBase):
    pass


class MarketBarORM(Base):
    """Riga storicizzata di una barra OHLCV normalizzata."""

    __tablename__ = "market_bars"
    __table_args__ = (
        UniqueConstraint(
            "symbol", "asset_class", "timeframe", "timestamp", "source",
            name="uq_market_bar_identity",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    asset_class: Mapped[str] = mapped_column(String(16), index=True)
    timeframe: Mapped[str] = mapped_column(String(8))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(32))


def create_sqlite_engine(database_url: str) -> Engine:
    """Crea l'engine SQLAlchemy e assicura che lo schema esista.

    Per un DB SQLite in-memory (`sqlite:///:memory:`), il pool di default di
    SQLAlchemy assegna una connessione per thread: ogni nuovo thread
    vedrebbe un database vuoto, senza le tabelle appena create (rilevante
    per i test e per l'esecuzione della dashboard del modulo 7 sotto
    FastAPI/uvicorn, che gestiscono le richieste in thread separati). Con
    `StaticPool` tutte le connessioni condividono la stessa unica
    connessione, quindi lo stesso database in memoria.
    """
    kwargs = {}
    if ":memory:" in database_url:
        kwargs = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
    engine = create_engine(database_url, future=True, **kwargs)
    Base.metadata.create_all(engine)
    return engine


class MarketDataRepository:
    """Repository per la persistenza/lettura delle barre di mercato.

    Effettua upsert idempotente: barre già presenti (stessa identità
    symbol+asset_class+timeframe+timestamp+source) non vengono duplicate.
    """

    def __init__(self, engine: Engine) -> None:
        self._engine = engine
        self._session_factory: sessionmaker[Session] = sessionmaker(bind=engine, future=True)

    def upsert_bars(self, bars: list[MarketBar]) -> int:
        """Salva le barre, ignorando quelle già presenti. Ritorna il numero di righe nuove."""
        if not bars:
            return 0

        inserted = 0
        with self._session_factory() as session:
            for bar in bars:
                exists = session.execute(
                    select(MarketBarORM.id).where(
                        MarketBarORM.symbol == bar.symbol,
                        MarketBarORM.asset_class == bar.asset_class.value,
                        MarketBarORM.timeframe == bar.timeframe.value,
                        MarketBarORM.timestamp == bar.timestamp,
                        MarketBarORM.source == bar.source,
                    )
                ).first()
                if exists:
                    continue
                session.add(
                    MarketBarORM(
                        symbol=bar.symbol,
                        asset_class=bar.asset_class.value,
                        timeframe=bar.timeframe.value,
                        timestamp=bar.timestamp,
                        open=bar.open,
                        high=bar.high,
                        low=bar.low,
                        close=bar.close,
                        volume=bar.volume,
                        source=bar.source,
                    )
                )
                inserted += 1
            session.commit()

        logger.info("Upsert completato | nuove_righe=%d totali_ricevute=%d", inserted, len(bars))
        return inserted

    def get_bars(
        self,
        symbol: str,
        asset_class: AssetClass,
        timeframe: Timeframe,
    ) -> list[MarketBarORM]:
        """Legge tutte le barre storicizzate per uno strumento, ordinate per timestamp."""
        with self._session_factory() as session:
            stmt = (
                select(MarketBarORM)
                .where(
                    MarketBarORM.symbol == symbol,
                    MarketBarORM.asset_class == asset_class.value,
                    MarketBarORM.timeframe == timeframe.value,
                )
                .order_by(MarketBarORM.timestamp)
            )
            return list(session.execute(stmt).scalars().all())
