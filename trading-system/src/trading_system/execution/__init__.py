"""Modulo 6 — Execution layer (non ancora implementato).

Paper trading di default. L'esecuzione con denaro reale vivrà in un
sottopacchetto separato (`execution.live`, non ancora creato) che richiede
conferma esplicita a runtime (`LIVE_TRADING_ENABLED=true` non basta da solo)
e broker/exchange diversi per ogni asset class (Alpaca/IB per azioni-ETF,
l'exchange crypto configurato per le crypto).
"""
