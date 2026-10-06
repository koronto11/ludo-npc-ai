import os
import socket
import subprocess
import sys
import time
from types import SimpleNamespace
from urllib.error import URLError
from urllib.request import urlopen

import pytest

from ludo_npc.__main__ import bind_local, open_when_ready


def test_skill_bridge_dispatch_does_not_start_server(monkeypatch):
    from ludo_npc import __main__ as launcher

    monkeypatch.setattr("sys.argv", ["NPCsAIStudio.exe", "--skill-bridge", "--help"])
    monkeypatch.setattr(
        launcher, "bind_local", lambda *args, **kwargs: pytest.fail("No server bind expected")
    )
    with pytest.raises(SystemExit) as result:
        launcher.main()
    assert result.value.code == 0


def test_default_port_conflict_uses_another_bound_loopback_socket():
    with socket.socket() as occupied:
        occupied.bind(("127.0.0.1", 0))
        occupied.listen()
        port = occupied.getsockname()[1]
        with bind_local(port, True) as selected:
            assert selected.getsockname()[0] == "127.0.0.1"
            assert selected.getsockname()[1] != port
        with pytest.raises(OSError):
            bind_local(port, False)


def test_browser_only_opens_when_server_started():
    opened = []
    server = SimpleNamespace(started=False, should_exit=True)
    open_when_ready(server, "http://127.0.0.1:9999/", opened.append, timeout=0)
    assert not opened
    server.started = True
    server.should_exit = False
    open_when_ready(server, "http://127.0.0.1:9999/", opened.append)
    assert opened == ["http://127.0.0.1:9999/"]


def test_redirected_launcher_starts_with_western_windows_encoding(tmp_path):
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    log_path = tmp_path / "startup.log"
    with log_path.open("wb") as log:
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "ludo_npc",
                "--port",
                str(port),
                "--no-browser",
                "--data-dir",
                str(tmp_path / "app"),
                "--project-dir",
                str(tmp_path / "中文工程"),
            ],
            env={**os.environ, "PYTHONIOENCODING": "cp1252", "PYTHONUTF8": "0"},
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + 15
            while time.monotonic() < deadline:
                assert process.poll() is None, log_path.read_text(
                    encoding="utf-8", errors="replace"
                )
                try:
                    with urlopen(f"http://127.0.0.1:{port}/api/health", timeout=0.5) as response:
                        assert response.status == 200
                    break
                except (URLError, TimeoutError):
                    time.sleep(0.05)
            else:
                pytest.fail("Isolated launcher did not become ready")
            assert "本地导演台" in log_path.read_text(encoding="utf-8")
        finally:
            process.terminate()
            process.wait(timeout=10)
