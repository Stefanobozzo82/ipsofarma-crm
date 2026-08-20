"""Fixture/helper condivisi per i test dello strategy engine.

Le serie di prezzi sono costruite in modo deterministico (nessun random non
seedato) per ottenere trend/RSI/volatilità prevedibili e test riproducibili.
"""

from __future__ import annotations

import pandas as pd


def make_bars(prices: list[float], asset_class: str = "etf") -> pd.DataFrame:
    """Costruisce un DataFrame di barre nello schema minimo (timestamp, close)."""
    timestamps = pd.date_range("2024-01-01", periods=len(prices), freq="D", tz="UTC")
    return pd.DataFrame({"timestamp": timestamps, "close": prices, "asset_class": asset_class})


def uptrend(periods: int = 60, start: float = 100.0, step: float = 1.0) -> list[float]:
    """Trend rialzista lineare: SMA corta finisce sopra SMA lunga."""
    return [start + i * step for i in range(periods)]


def downtrend(periods: int = 60, start: float = 100.0, step: float = 1.0) -> list[float]:
    """Trend ribassista lineare: SMA corta finisce sotto SMA lunga."""
    return [start - i * step for i in range(periods)]


def flat(periods: int = 60, price: float = 100.0) -> list[float]:
    """Prezzo costante: SMA corta e lunga coincidono."""
    return [price] * periods


def monotonic_decline(periods: int = 40, start: float = 100.0, pct: float = 0.01) -> list[float]:
    """Discesa a rendimento percentuale costante: solo perdite => RSI verso 0, volatilità ~0."""
    prices = [start]
    for _ in range(periods - 1):
        prices.append(prices[-1] * (1 - pct))
    return prices


def monotonic_rise(periods: int = 40, start: float = 100.0, pct: float = 0.01) -> list[float]:
    """Salita a rendimento percentuale costante: solo guadagni => RSI verso 100, volatilità ~0."""
    prices = [start]
    for _ in range(periods - 1):
        prices.append(prices[-1] * (1 + pct))
    return prices


def alternating(periods: int = 40, base: float = 100.0, amplitude: float = 1.0) -> list[float]:
    """Oscillazione regolare +/-: guadagni e perdite bilanciati => RSI neutro, bassa volatilità."""
    prices = []
    for i in range(periods):
        prices.append(base + amplitude if i % 2 == 0 else base - amplitude)
    return prices


def zigzag_high_volatility(periods: int = 40, low: float = 100.0, high: float = 150.0) -> list[float]:
    """Oscillazione ampia +50%/-33%: volatilità annualizzata molto alta indipendentemente dall'RSI."""
    prices = []
    for i in range(periods):
        prices.append(high if i % 2 == 0 else low)
    return prices


def zigzag_pct(periods: int = 30, base: float = 100.0, pct: float = 0.01) -> list[float]:
    """Oscillazione regolare +/-pct% attorno a `base`: permette di calibrare
    con precisione la volatilità annualizzata risultante (a differenza di
    `zigzag_high_volatility`, pensata per essere sempre estrema)."""
    prices = []
    for i in range(periods):
        prices.append(base * (1 + pct) if i % 2 == 0 else base * (1 - pct))
    return prices
