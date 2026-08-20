"""Modulo 7 — Dashboard/report.

API FastAPI di sola lettura sopra ciò che i moduli 1-6 hanno già prodotto:
stato del portafoglio aggregato e per asset class (`GET /portfolio`),
storico operazioni con la motivazione di ogni trade (`GET /orders`), alert
su anomalie — scostamento dal profilo target, posizioni vicine/oltre lo
stop-loss teorico, ordini ripetutamente rifiutati (`GET /alerts`).

Nessun endpoint genera segnali, valuta rischio, alloca budget o esegue
ordini: quella logica resta nei moduli 2-6, richiamata da script/scheduler,
non dalla dashboard.

`create_app()` (in `app.py`) costruisce l'applicazione; `main.py` è il
bersaglio per `uvicorn trading_system.api.main:app`.
"""

from trading_system.api.app import create_app

__all__ = ["create_app"]
