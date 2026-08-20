"""Broker per l'esecuzione con denaro REALE. Isolati qui deliberatamente.

Nessuna classe in questo sottopacchetto viene istanziata automaticamente:
`ExecutionManager` la costruisce solo dopo che `execution.gate.LiveTradingGate`
ha approvato esplicitamente il passaggio al live per quel simbolo/strategia
(backtest positivo e non scaduto, più conferma esplicita a runtime o
periodo di validazione in paper trading superato — mai un default implicito).

Ogni broker richiede le proprie credenziali (vedi `.env.example`), lette da
`config/settings.py`: se mancano, il costruttore solleva
`ConfigurationError` con un messaggio esplicito — non vengono mai inventate
né sostituite da un placeholder silenzioso.

- `AlpacaBroker`: azioni/ETF, via Alpaca (`alpaca-py`, dipendenza opzionale
  — vedi `requirements.txt`).
- `CCXTBroker`: crypto, via ccxt in modalità autenticata (stesso pacchetto
  già usato dal modulo 1 per i dati, qui con le chiamate di trading).
"""
