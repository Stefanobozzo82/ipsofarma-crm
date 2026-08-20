"""Test di AlpacaBroker (azioni/ETF, live).

Usa un client fittizio che imita l'interfaccia di `alpaca-py` (verificata
per corrispondenza — vedi il docstring del modulo): nessuna chiamata di
rete reale, nessuna credenziale necessaria per questi test.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from trading_system.common.enums import AssetClass, OrderSide, OrderStatus
from trading_system.common.exceptions import ConfigurationError, DataSourceError
from trading_system.execution.live.alpaca_broker import AlpacaBroker


class _FakeAlpacaClient:
    def __init__(self, submit_response=None, submit_error=None, account_cash="50000.00", positions=None):
        self._submit_response = submit_response
        self._submit_error = submit_error
        self._account_cash = account_cash
        self._positions = positions or []

    def submit_order(self, order_data):
        if self._submit_error:
            raise self._submit_error
        return self._submit_response

    def get_account(self):
        return SimpleNamespace(cash=self._account_cash)

    def get_open_position(self, symbol):
        for p in self._positions:
            if p.symbol == symbol:
                return p
        raise Exception("position does not exist")  # comportamento reale di alpaca-py per una posizione assente

    def get_all_positions(self):
        return self._positions


def _broker(client) -> AlpacaBroker:
    return AlpacaBroker("key", "secret", "https://paper-api.alpaca.markets", client_factory=lambda *a: client)


def test_missing_credentials_raise_configuration_error():
    with pytest.raises(ConfigurationError):
        AlpacaBroker(None, None, "https://paper-api.alpaca.markets")

    with pytest.raises(ConfigurationError):
        AlpacaBroker("key", None, "https://paper-api.alpaca.markets")


def test_successful_order_maps_to_filled_order():
    response = SimpleNamespace(filled_avg_price="150.25", filled_qty="10")
    broker = _broker(_FakeAlpacaClient(submit_response=response))

    order = broker.submit_order("AAPL", AssetClass.EQUITY, OrderSide.BUY, 10.0, "s1", "buy signal")

    assert order.status == OrderStatus.FILLED
    assert order.filled_price == pytest.approx(150.25)
    assert order.broker == "alpaca"


def test_order_not_yet_filled_maps_to_submitted():
    response = SimpleNamespace(filled_avg_price=None, filled_qty="0")
    broker = _broker(_FakeAlpacaClient(submit_response=response))

    order = broker.submit_order("AAPL", AssetClass.EQUITY, OrderSide.BUY, 10.0, "s1", "buy")

    assert order.status == OrderStatus.SUBMITTED
    assert order.filled_price is None


def test_broker_error_on_submit_rejects_gracefully_without_raising():
    broker = _broker(_FakeAlpacaClient(submit_error=RuntimeError("insufficient buying power")))

    order = broker.submit_order("AAPL", AssetClass.EQUITY, OrderSide.BUY, 10.0, "s1", "buy")

    assert order.status == OrderStatus.REJECTED
    assert "insufficient buying power" in order.reason


def test_non_positive_quantity_rejects_without_calling_broker():
    client = _FakeAlpacaClient(submit_error=RuntimeError("non dovrebbe essere chiamato"))
    broker = _broker(client)

    order = broker.submit_order("AAPL", AssetClass.EQUITY, OrderSide.BUY, 0.0, "s1", "buy")

    assert order.status == OrderStatus.REJECTED


def test_get_cash_parses_account_response():
    broker = _broker(_FakeAlpacaClient(account_cash="12345.67"))
    assert broker.get_cash() == pytest.approx(12345.67)


def test_get_position_returns_none_when_absent():
    broker = _broker(_FakeAlpacaClient(positions=[]))
    assert broker.get_position("AAPL") is None


def test_get_position_maps_existing_position():
    position = SimpleNamespace(symbol="AAPL", qty="5", avg_entry_price="145.00")
    broker = _broker(_FakeAlpacaClient(positions=[position]))

    result = broker.get_position("AAPL")

    assert result.symbol == "AAPL"
    assert result.quantity == 5.0
    assert result.average_entry_price == 145.0


def test_get_positions_maps_all():
    positions = [
        SimpleNamespace(symbol="AAPL", qty="5", avg_entry_price="145.00"),
        SimpleNamespace(symbol="MSFT", qty="2", avg_entry_price="300.00"),
    ]
    broker = _broker(_FakeAlpacaClient(positions=positions))

    result = broker.get_positions()

    assert {p.symbol for p in result} == {"AAPL", "MSFT"}


def test_get_positions_error_raises_data_source_error():
    class _BrokenClient(_FakeAlpacaClient):
        def get_all_positions(self):
            raise RuntimeError("connessione persa")

    broker = _broker(_BrokenClient())

    with pytest.raises(DataSourceError):
        broker.get_positions()
