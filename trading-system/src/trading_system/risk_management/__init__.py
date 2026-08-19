"""Modulo 3 — Risk management (non ancora implementato).

Position sizing e limiti separati per asset class (letti da
`config/risk_limits.yaml`), stop-loss, filtro di esclusione per volatilità
eccessiva. I limiti su crypto devono restare sempre più stringenti di quelli
su azioni/ETF: è un vincolo che questo modulo validerà a runtime.
Nessuna operazione (nemmeno paper trading) può essere autorizzata se
`config/risk_limits.yaml` non è stato compilato esplicitamente.
"""
