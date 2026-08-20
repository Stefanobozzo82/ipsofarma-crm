"""Entry point per servire la dashboard: `uvicorn trading_system.api.main:app`.

Separato da `app.py` di proposito: `create_app()` apre connessioni reali
(DB, tentativo di lettura di `config/risk_limits.yaml`/`portfolio.yaml`) —
un side effect che non deve scattare quando `app.py` viene semplicemente
importato per i test (`from trading_system.api.app import create_app`).
Questo modulo esiste solo per essere il bersaglio di uvicorn.
"""

from trading_system.api.app import create_app

app = create_app()
