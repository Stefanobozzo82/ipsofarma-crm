"""Test del contratto di uscita di scripts/run_cycle_once.py: uno scheduler
esterno (es. GitHub Actions) deve poter distinguere successo da fallimento
dal solo exit code, senza dover interpretare l'output.

Il modulo viene caricato da percorso (non è un package importabile
normalmente) e la sua dipendenza `build_pipeline` viene sostituita con un
fake: nessuna configurazione reale, nessuna rete.
"""

from __future__ import annotations

import importlib.util
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType

import pytest

from trading_system.orchestration.cycle import CycleReport

_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "run_cycle_once.py"


def _load_script_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("run_cycle_once", _SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class _FakePipeline:
    def __init__(self, run_once_fn) -> None:
        self.execution_config = type("_Cfg", (), {"mode": "paper"})()
        self._run_once_fn = run_once_fn

    def run_once(self) -> CycleReport:
        return self._run_once_fn()


def _empty_report() -> CycleReport:
    now = datetime.now(timezone.utc)
    return CycleReport(started_at=now, finished_at=now)


@pytest.fixture
def script_module(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    module = _load_script_module()
    sys.modules.pop("run_cycle_once", None)  # non lasciarlo registrato tra i test
    return module


def test_main_returns_zero_on_successful_cycle(script_module: ModuleType, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(script_module, "build_pipeline", lambda: _FakePipeline(_empty_report))

    exit_code = script_module.main()

    assert exit_code == 0


def test_main_returns_nonzero_when_the_cycle_raises(script_module: ModuleType, monkeypatch: pytest.MonkeyPatch):
    def _boom() -> CycleReport:
        raise RuntimeError("errore imprevisto (test)")

    monkeypatch.setattr(script_module, "build_pipeline", lambda: _FakePipeline(_boom))

    exit_code = script_module.main()

    assert exit_code != 0


def test_main_returns_nonzero_when_configuration_is_invalid(script_module: ModuleType, monkeypatch: pytest.MonkeyPatch):
    from trading_system.common.exceptions import ConfigurationError

    def _build_pipeline_fails():
        raise ConfigurationError("config/risk_limits.yaml non compilato (test)")

    monkeypatch.setattr(script_module, "build_pipeline", _build_pipeline_fails)

    with pytest.raises(ConfigurationError):
        script_module.main()
