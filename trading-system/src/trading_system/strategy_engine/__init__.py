"""Modulo 2 — Strategy engine (non ancora implementato).

Regole configurabili per asset class (es. media mobile/rebalancing per ETF,
RSI/volatilità per crypto, dati fondamentali per azioni), ognuna con uno
score di confidenza. Consuma `trading_system.data_ingestion` e produce
`trading_system.common.models.Signal`.
"""
