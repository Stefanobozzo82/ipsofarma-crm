"""Test del position sizing."""

from __future__ import annotations

import pytest

from tests.risk_management.conftest import build_config
from trading_system.risk_management.position_sizing import PositionSizer


def test_bound_by_per_instrument_cap():
    config = build_config()
    sizer = PositionSizer(risk_per_trade_pct=1.0)

    result = sizer.size_position(
        account_equity=100_000.0,
        entry_price=50.0,
        confidence=1.0,
        limits=config.equity,  # stop_loss_pct=8.0, max_position_pct=10.0, max_portfolio_pct=60.0
    )

    # risk_amount=1000, risk_based_value=1000/0.08=12500
    # per_instrument_cap=100000*0.10=10000  <- il più stringente dei tre
    # portfolio_cap=100000*0.60=60000
    assert result.position_value == pytest.approx(10_000.0)
    assert result.quantity == pytest.approx(200.0)
    assert "limite per strumento" in result.reason


def test_bound_by_risk_per_trade_when_stop_is_tight():
    config = build_config()
    sizer = PositionSizer(risk_per_trade_pct=1.0)

    result = sizer.size_position(
        account_equity=100_000.0,
        entry_price=50.0,
        confidence=1.0,
        limits=config.crypto,  # stop_loss_pct=5.0, max_position_pct=5.0, max_portfolio_pct=15.0
    )

    # risk_amount=1000, risk_based_value=1000/0.05=20000
    # per_instrument_cap=100000*0.05=5000  <- ancora più stringente
    assert result.position_value == pytest.approx(5_000.0)
    assert "limite per strumento" in result.reason


def test_confidence_scales_risk_amount_linearly():
    config = build_config()
    # risk_per_trade_pct basso, così il vincolo binding resta "rischio per
    # trade" (non un cap) a entrambi i livelli di confidenza confrontati.
    sizer = PositionSizer(risk_per_trade_pct=0.5)

    full_confidence = sizer.size_position(100_000.0, 1000.0, confidence=1.0, limits=config.etf)
    half_confidence = sizer.size_position(100_000.0, 1000.0, confidence=0.5, limits=config.etf)

    assert "rischio per trade" in full_confidence.reason
    assert "rischio per trade" in half_confidence.reason
    assert half_confidence.position_value == pytest.approx(full_confidence.position_value / 2)


def test_zero_confidence_produces_no_position():
    config = build_config()
    sizer = PositionSizer()

    result = sizer.size_position(100_000.0, 50.0, confidence=0.0, limits=config.equity)

    assert result.quantity == 0.0
    assert result.position_value == 0.0
    assert "Confidenza" in result.reason


def test_exposure_already_at_portfolio_cap_produces_no_position():
    config = build_config()
    sizer = PositionSizer()

    result = sizer.size_position(
        100_000.0, 50.0, confidence=1.0, limits=config.crypto,
        current_asset_class_exposure_pct=config.crypto.max_portfolio_pct,
    )

    assert result.quantity == 0.0
    assert "già al limite di portafoglio" in result.reason


def test_partial_remaining_portfolio_budget_caps_position():
    config = build_config()
    sizer = PositionSizer(risk_per_trade_pct=100.0)  # forza il vincolo di portafoglio a essere il più stretto

    result = sizer.size_position(
        100_000.0, 50.0, confidence=1.0, limits=config.equity,
        current_asset_class_exposure_pct=config.equity.max_portfolio_pct - 5.0,  # restano 5 punti % di budget
    )

    assert result.position_value == pytest.approx(100_000.0 * 0.05)
    assert "limite di portafoglio per asset class" in result.reason


def test_non_positive_equity_produces_no_position():
    config = build_config()
    sizer = PositionSizer()

    result = sizer.size_position(0.0, 50.0, confidence=1.0, limits=config.equity)

    assert result.quantity == 0.0


def test_invalid_entry_price_rejected():
    config = build_config()
    sizer = PositionSizer()
    with pytest.raises(ValueError):
        sizer.size_position(100_000.0, 0.0, confidence=1.0, limits=config.equity)


def test_invalid_confidence_rejected():
    config = build_config()
    sizer = PositionSizer()
    with pytest.raises(ValueError):
        sizer.size_position(100_000.0, 50.0, confidence=1.5, limits=config.equity)


def test_invalid_risk_per_trade_pct_rejected():
    with pytest.raises(ValueError):
        PositionSizer(risk_per_trade_pct=0.0)
