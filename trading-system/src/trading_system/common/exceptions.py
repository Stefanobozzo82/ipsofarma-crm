"""Eccezioni condivise dal sistema."""

from __future__ import annotations


class TradingSystemError(Exception):
    """Base per tutte le eccezioni applicative del sistema."""


class DataSourceError(TradingSystemError):
    """Errore nel recupero o nella normalizzazione dei dati di mercato."""


class ConfigurationError(TradingSystemError):
    """Configurazione mancante o non valida (es. limiti di rischio non compilati)."""
