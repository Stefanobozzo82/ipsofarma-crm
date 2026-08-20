# paper-trading-state

Questo branch NON contiene codice: contiene solo lo stato persistito del
conto paper trading (`trading-system/data/trading_system.db`) usato dal
workflow GitHub Actions `.github/workflows/trading-cycle.yml` (definito sul
branch di codice) per far sopravvivere cassa/posizioni/storico ordini tra
un'esecuzione pianificata e la successiva.

- Ogni commit qui è un ciclo autonomo eseguito (vedi il messaggio di commit
  per data/ora).
- È **sempre e solo** stato di paper trading (denaro simulato): l'esecuzione
  live resta un modulo isolato a parte, mai eseguita da questo workflow.
- Non modificare a mano il file `.db` in questo branch: verrebbe
  sovrascritto dal prossimo ciclo pianificato.

Per i dettagli su come funziona, vedi la sezione "Modulo 8 — Orchestrazione
autonoma" nel README del branch di codice.
