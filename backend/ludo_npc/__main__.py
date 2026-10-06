import argparse
import os
import socket
import sys
import threading
import time
import webbrowser

import uvicorn


def bind_local(port, fallback):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", port))
    except OSError:
        if not fallback:
            sock.close()
            raise
        sock.bind(("127.0.0.1", 0))
    sock.listen(128)
    sock.set_inheritable(True)
    return sock


def open_when_ready(server, url, opener=webbrowser.open, timeout=20):
    deadline = time.monotonic() + timeout
    while not server.started and not server.should_exit and time.monotonic() < deadline:
        time.sleep(0.05)
    if server.started and not server.should_exit:
        opener(url)


def main():
    # Redirected output on non-Chinese Windows otherwise defaults to a code page
    # that cannot represent the localized startup message or project paths.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    if len(sys.argv) > 1 and sys.argv[1] == "--skill-bridge":
        from .skill_bridge import cli_main

        cli_main(sys.argv[2:])
        return
    parser = argparse.ArgumentParser(description="NPCs AI Studio 本地文件与导演台服务")
    parser.add_argument("--port", type=int, default=4174)
    parser.add_argument("--data-dir")
    parser.add_argument("--project-dir")
    parser.add_argument("--open-browser", action="store_true")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("端口需在 1–65535 之间")
    if args.data_dir:
        os.environ["NPCS_AI_STUDIO_DATA_DIR"] = args.data_dir
    if args.project_dir:
        os.environ["NPCS_AI_STUDIO_PROJECT_DIR"] = args.project_dir
    explicit_port = any(value == "--port" or value.startswith("--port=") for value in sys.argv[1:])
    try:
        sock = bind_local(args.port, fallback=not explicit_port)
    except OSError as exc:
        parser.exit(1, f"本地端口 {args.port} 无法使用，请关闭占用程序或选择其他端口。\n{exc}\n")
    actual_port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{actual_port}/"
    print(f"NPCs AI Studio 本地导演台：{url}", flush=True)
    config = uvicorn.Config(
        "ludo_npc.api.app:app",
        host="127.0.0.1",
        port=actual_port,
        workers=1,
        timeout_graceful_shutdown=5,
    )
    server = uvicorn.Server(config)
    browser_thread = None
    if not args.no_browser and (
        args.open_browser or (getattr(sys, "frozen", False) and len(sys.argv) == 1)
    ):
        browser_thread = threading.Thread(target=open_when_ready, args=(server, url), daemon=True)
        browser_thread.start()
    try:
        server.run(sockets=[sock])
    finally:
        server.should_exit = True
        sock.close()
        if browser_thread:
            browser_thread.join(timeout=0.2)


if __name__ == "__main__":
    main()
