"""Configurazione centrale dell'applicazione.

Legge le variabili d'ambiente (da `.env` o dall'ambiente reale) e le espone
come oggetto validato. Nessun valore sensibile ha un default hardcoded:
tutto ciò che manca resta `None` finché non viene fornito esplicitamente.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
DATA_DIR = PROJECT_ROOT / "data"
LOGS_DIR = PROJECT_ROOT / "logs"

RISK_LIMITS_PATH = CONFIG_DIR / "risk_limits.yaml"
ASSETS_PATH = CONFIG_DIR / "assets.yaml"


class Settings(BaseSettings):
    """Impostazioni applicative, caricate da variabili d'ambiente / .env.

    Ogni campo relativo a credenziali è opzionale e `None` di default:
    i moduli che ne hanno bisogno (execution, fonti dati a pagamento)
    devono verificare esplicitamente la presenza del valore e fallire in
    modo chiaro se manca, invece di usare placeholder finti.
    """

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Generale ---
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")

    # --- Database ---
    database_url: str | None = Field(default=None)

    # --- Data ingestion: fonti dati alternative (opzionali) ---
    alphavantage_api_key: str | None = Field(default=None)
    polygon_api_key: str | None = Field(default=None)

    # --- Execution: azioni/ETF (modulo 6, non ancora implementato) ---
    alpaca_api_key: str | None = Field(default=None)
    alpaca_api_secret: str | None = Field(default=None)
    alpaca_base_url: str = Field(default="https://paper-api.alpaca.markets")

    # --- Execution: crypto (modulo 6, non ancora implementato) ---
    binance_api_key: str | None = Field(default=None)
    binance_api_secret: str | None = Field(default=None)
    kraken_api_key: str | None = Field(default=None)
    kraken_api_secret: str | None = Field(default=None)

    # --- Interruttore esplicito per denaro reale (modulo 6) ---
    live_trading_enabled: bool = Field(default=False)

    @property
    def resolved_database_url(self) -> str:
        """URL del database: usa DATABASE_URL se impostato, altrimenti SQLite locale."""
        if self.database_url:
            return self.database_url
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{(DATA_DIR / 'trading_system.db').as_posix()}"


@lru_cache
def get_settings() -> Settings:
    """Restituisce l'istanza (cached) delle impostazioni applicative."""
    return Settings()
