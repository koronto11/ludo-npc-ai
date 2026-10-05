import argparse
import os
import sys
import webbrowser

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Ludo 本地文件与导演台服务")
    parser.add_argument("--port", type=int, default=4174)
    parser.add_argument("--data-dir")
    parser.add_argument("--project-dir")
    parser.add_argument("--open-browser", action="store_true")
    args = parser.parse_args()
    if args.data_dir:
        os.environ["LUDO_DATA_DIR"] = args.data_dir
    if args.project_dir:
        os.environ["LUDO_PROJECT_DIR"] = args.project_dir
    if args.open_browser or (getattr(sys, "frozen", False) and len(sys.argv) == 1):
        from threading import Timer

        Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{args.port}/")).start()
    uvicorn.run(
        "ludo_npc.api.app:app",
        host="127.0.0.1",
        port=args.port,
        workers=1,
        timeout_graceful_shutdown=5,
    )


if __name__ == "__main__":
    main()
