"""Test del calcolo e della verifica dello stop-loss."""

from __future__ import annotations

import pytest

from trading_system.common.enums import OrderSide
from trading_system.risk_management.stop_loss import compute_stop_loss_price, is_stop_triggered


def test_buy_stop_loss_is_below_entry_price():
    stop = compute_stop_loss_price(100.0, OrderSide.BUY, stop_loss_pct=5.0)
    assert stop == pytest.approx(95.0)


def test_sell_stop_loss_is_above_entry_price():
    stop = compute_stop_loss_price(100.0, OrderSide.SELL, stop_loss_pct=5.0)
    assert stop == pytest.approx(105.0)


def test_invalid_entry_price_rejected():
    with pytest.raises(ValueError):
        compute_stop_loss_price(0.0, OrderSide.BUY, stop_loss_pct=5.0)


def test_invalid_stop_loss_pct_rejected():
    with pytest.raises(ValueError):
        compute_stop_loss_price(100.0, OrderSide.BUY, stop_loss_pct=0.0)


def test_buy_stop_triggered_when_price_falls_to_or_below_stop():
    assert is_stop_triggered(95.0, stop_loss_price=95.0, side=OrderSide.BUY) is True
    assert is_stop_triggered(94.0, stop_loss_price=95.0, side=OrderSide.BUY) is True
    assert is_stop_triggered(96.0, stop_loss_price=95.0, side=OrderSide.BUY) is False


def test_sell_stop_triggered_when_price_rises_to_or_above_stop():
    assert is_stop_triggered(105.0, stop_loss_price=105.0, side=OrderSide.SELL) is True
    assert is_stop_triggered(106.0, stop_loss_price=105.0, side=OrderSide.SELL) is True
    assert is_stop_triggered(104.0, stop_loss_price=105.0, side=OrderSide.SELL) is False
