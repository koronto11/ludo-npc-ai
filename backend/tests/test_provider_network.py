"""Exercise actual sockets so proxy routing cannot pass through a mock transport."""

import asyncio
import json
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import pytest

from ludo_npc.providers import ChatProvider, ProviderError
from ludo_npc.storage import ProviderProfile


@contextmanager
def server(handler):
    instance = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=instance.serve_forever, daemon=True)
    thread.start()
    try:
        yield instance.server_port
    finally:
        instance.shutdown()
        instance.server_close()
        thread.join(timeout=2)


def configure_proxy(monkeypatch, port):
    for key in ("http_proxy", "https_proxy", "all_proxy", "no_proxy", "ALL_PROXY", "NO_PROXY"):
        monkeypatch.delenv(key, raising=False)
    for key in ("HTTP_PROXY", "HTTPS_PROXY"):
        monkeypatch.setenv(key, f"http://127.0.0.1:{port}")
    monkeypatch.setenv("NO_PROXY", "")


def profile(endpoint, mode="remote"):
    return ProviderProfile(
        id="network-test", name="Network fixture", endpoint=endpoint, model="fixture", mode=mode
    )


def test_remote_request_reaches_environment_https_proxy(monkeypatch):
    tunnels = []

    class Proxy(BaseHTTPRequestHandler):
        def do_CONNECT(self):
            tunnels.append((self.path, self.headers.get("Authorization")))
            self.send_error(502)

        def log_message(self, *_):
            pass

    with server(Proxy) as port:
        configure_proxy(monkeypatch, port)
        with pytest.raises(ProviderError) as error:
            asyncio.run(
                ChatProvider().complete(
                    profile("https://model.invalid/v1"), "fixture-session-key", []
                )
            )
    assert tunnels == [("model.invalid:443", None)]
    assert error.value.code == "connection"
    assert "fixture-session-key" not in str(error.value)


@pytest.mark.parametrize("mode", ["local", "remote"])
@pytest.mark.parametrize("host", ["localhost", "127.0.0.1"])
def test_loopback_model_remains_direct_with_environment_proxy(monkeypatch, mode, host):
    requests, proxy_requests = [], []

    class Model(BaseHTTPRequestHandler):
        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            requests.append((self.path, payload["model"]))
            body = json.dumps({"choices": [{"message": {"content": "fixture OK"}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    class Proxy(BaseHTTPRequestHandler):
        def do_POST(self):
            proxy_requests.append(self.path)
            self.send_error(502)

        def log_message(self, *_):
            pass

    with server(Proxy) as proxy_port, server(Model) as model_port:
        configure_proxy(monkeypatch, proxy_port)
        result = asyncio.run(
            ChatProvider().complete(profile(f"http://{host}:{model_port}/v1", mode), "", [])
        )
    assert result == ("fixture OK", {})
    assert requests == [("/v1/chat/completions", "fixture")]
    assert proxy_requests == []
