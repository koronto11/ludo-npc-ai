import socket
from types import SimpleNamespace

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
