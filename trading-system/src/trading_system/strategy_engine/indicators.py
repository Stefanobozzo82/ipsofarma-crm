"""Indicatori tecnici condivisi tra le strategie.

Funzioni pure su `pandas.Series`, senza stato: ogni strategia le richiama
sulla serie `close` (o sui rendimenti) delle barre normalizzate prodotte dal
modulo 1. Tenerle qui, separate dalle strategie, permette di testarle una
volta sola e di riusarle su asset class diverse (es. la SMA è usata sia da
ETF che da azioni).
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(close: pd.Series, window: int) -> pd.Series:
    """Media mobile semplice su `window` barre."""
    return close.rolling(window=window, min_periods=window).mean()


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index (RSI), formulazione di Wilder.

    Restituisce valori in [0, 100]. I primi `period` valori sono NaN (dati
    insufficienti per una media stabile).
    """
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)

    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    result = 100.0 - (100.0 / (1.0 + rs))
    # avg_loss == 0 (solo rialzi nel periodo) => RSI = 100, non NaN
    result = result.mask(avg_loss == 0.0, 100.0)
    result = result.mask(avg_gain.isna() | avg_loss.isna())
    return result


def annualized_volatility(close: pd.Series, window: int, periods_per_year: int = 365) -> pd.Series:
    """Volatilità annualizzata (stdev dei rendimenti percentuali) su `window` barre.

    `periods_per_year` di default assume barre giornaliere su un mercato che
    tratta 365 giorni/anno (adatto alle crypto); per azioni/ETF (barre
    giornaliere, ~252 sedute/anno) passa `periods_per_year=252`.
    """
    returns = close.pct_change()
    return returns.rolling(window=window, min_periods=window).std() * np.sqrt(periods_per_year)
