"""Test di CCXTBroker (crypto, live).

Usa un exchange fittizio con l'interfaccia ccxt reale (`create_order`,
`fetch_balance`), nessuna chiamata di rete reale, nessuna credenziale
necessaria per questi test.
"""

from __future__ import annotations

import pytest

from trading_system.common.enums import AssetClass, OrderSide, OrderStatus
from trading_system.common.exceptions import ConfigurationError, DataSourceError
from trading_system.execution.live.ccxt_broker import CCXTBroker


class _FakeExchange:
    def __init__(self, create_order_response=None, create_order_error=None, balance=None):
        self._create_order_response = create_order_response
        self._create_order_error = create_order_error
        self._balance = balance or {}

    def create_order(self, symbol, type, side, amount, price=None, params=None):
        if self._create_order_error:
            raise self._create_order_error
        return self._create_order_response

    def fetch_balance(self):
        return self._balance


def _broker(exchange, exchange_id="kraken") -> CCXTBroker:
    return CCXTBroker(exchange_id, "key", "secret", quote_currency="USDT", exchange_factory=lambda *a: exchange)


def test_missing_credentials_raise_configuration_error():
    with pytest.raises(ConfigurationError, match="kraken"):
        CCXTBroker("kraken", None, None)

    with pytest.raises(ConfigurationError):
        CCXTBroker("kraken", "key", None)


def test_successful_order_maps_to_filled_order():
    response = {"filled": 0.5, "average": 42000.0}
    broker = _broker(_FakeExchange(create_order_response=response))

    order = broker.submit_order("BTC/USDT", AssetClass.CRYPTO, OrderSide.BUY, 0.5, "s1", "buy signal")

    assert order.status == OrderStatus.FILLED
    assert order.filled_price == pytest.approx(42000.0)
    assert order.broker == "ccxt.kraken"


def test_order_not_yet_filled_maps_to_submitted():
    response = {"filled": 0.0, "average": None, "price": None}
    broker = _broker(_FakeExchange(create_order_response=response))

    order = broker.submit_order("BTC/USDT", AssetClass.CRYPTO, OrderSide.BUY, 0.5, "s1", "buy")

    assert order.status == OrderStatus.SUBMITTED


def test_exchange_error_on_submit_rejects_gracefully_without_raising():
    broker = _broker(_FakeExchange(create_order_error=RuntimeError("insufficient funds")))

    order = broker.submit_order("BTC/USDT", AssetClass.CRYPTO, OrderSide.BUY, 0.5, "s1", "buy")

    assert order.status == OrderStatus.REJECTED
    assert "insufficient funds" in order.reason


def test_non_positive_quantity_rejects_without_calling_exchange():
    exchange = _FakeExchange(create_order_error=RuntimeError("non dovrebbe essere chiamato"))
    broker = _broker(exchange)

    order = broker.submit_order("BTC/USDT", AssetClass.CRYPTO, OrderSide.BUY, 0.0, "s1", "buy")

    assert order.status == OrderStatus.REJECTED


def test_get_cash_reads_quote_currency_free_balance():
    balance = {"USDT": {"free": 1234.5, "total": 2000.0}}
    broker = _broker(_FakeExchange(balance=balance))

    assert broker.get_cash() == pytest.approx(1234.5)


def test_get_cash_missing_currency_returns_zero():
    broker = _broker(_FakeExchange(balance={}))
    assert broker.get_cash() == 0.0


def test_get_position_returns_none_when_zero_balance():
    balance = {"BTC": {"total": 0.0}}
    broker = _broker(_FakeExchange(balance=balance))

    assert broker.get_position("BTC/USDT") is None


def test_get_position_maps_nonzero_balance_with_zero_cost_basis():
    balance = {"BTC": {"total": 0.75}}
    broker = _broker(_FakeExchange(balance=balance))

    position = broker.get_position("BTC/USDT")

    assert position.symbol == "BTC/USDT"
    assert position.quantity == pytest.approx(0.75)
    assert position.average_entry_price == 0.0  # non tracciato dall'exchange spot, sentinella esplicita


def test_get_positions_excludes_quote_currency_and_metadata_keys():
    balance = {
        "USDT": {"total": 5000.0},
        "BTC": {"total": 0.5},
        "ETH": {"total": 2.0},
        "info": {"raw": "dati grezzi dell'exchange"},
    }
    broker = _broker(_FakeExchange(balance=balance))

    positions = broker.get_positions()

    assert {p.symbol for p in positions} == {"BTC/USDT", "ETH/USDT"}


def test_get_positions_error_raises_data_source_error():
    class _BrokenExchange(_FakeExchange):
        def fetch_balance(self):
            raise RuntimeError("connessione persa")

    broker = _broker(_BrokenExchange())

    with pytest.raises(DataSourceError):
        broker.get_positions()
