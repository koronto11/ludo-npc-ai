"""Verify a built Windows app's saved credentials using only a loopback fixture."""

import argparse
import json
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import httpx2 as httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", type=Path, required=True)
    parser.add_argument("--area", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--port", type=int, default=4194)
    args = parser.parse_args()
    area = args.area.resolve()
    area.mkdir(parents=True, exist_ok=True)
    checks, received = [], []
    key_a, key_b = "package-fixture-key-a", "package-fixture-key-b"

    class Fixture(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            received.append((body["model"], self.headers.get("Authorization")))
            if body["max_tokens"] == 64:
                content = "OK"
            else:
                item = json.loads(body["messages"][-1]["content"])
                content = json.dumps({"patch": {"name": item["name"], "story": "fixture story"}})
            payload = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    fixture = ThreadingHTTPServer(("127.0.0.1", 0), Fixture)
    Thread(target=fixture.serve_forever, daemon=True).start()
    endpoint = f"http://127.0.0.1:{fixture.server_port}/v1"
    profiles = [
        {"id": f"fixture-{name}", "name": f"fixture {name}", "endpoint": endpoint,
         "model": name, "mode": "remote"}
        for name in ("a", "b")
    ]
    process = None
    log = (area / "server.log").open("w", encoding="utf-8")
    client = httpx.Client(base_url=f"http://127.0.0.1:{args.port}", trust_env=False, timeout=10)

    def launch():
        task = subprocess.Popen(
            [str(args.exe.resolve()), "--no-browser", "--port", str(args.port),
             "--data-dir", str(area / "app"), "--project-dir", str(area / "projects")],
            stdout=log, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        for _ in range(100):
            if task.poll() is not None:
                raise RuntimeError("Packaged app exited before readiness")
            try:
                if client.get("/api/health").status_code == 200:
                    client.get("/api/session")
                    return task
            except httpx.RequestError:
                pass
            time.sleep(0.1)
        task.terminate()
        task.wait(timeout=10)
        raise RuntimeError("Packaged app readiness timed out")

    def checked(label, value):
        assert value, label
        checks.append({"name": label, "passed": True})

    try:
        process = launch()
        for p, key in zip(profiles, (key_a, key_b), strict=True):
            checked(f"profile_{p['model']}", client.put("/api/workspace/model-profiles", json=p).status_code == 200)
            result = client.put(
                f"/api/workspace/model-profiles/{p['id']}/credential",
                json={"endpoint": endpoint, "api_key": key},
            )
            checked(f"save_encrypted_{p['model']}", result.status_code == 200 and key not in result.text)
        process.terminate()
        process.wait(timeout=10)
        process = launch()
        info = client.get("/api/workspace").json()
        checked("restart_retains_both", all(info["credentials"]["saved"].get(p["id"]) for p in profiles))
        for p in profiles:
            checked(f"probe_without_key_{p['model']}", client.post("/api/models/test", json={"profile": p}).status_code == 200)
        checked("isolated_authorization", received == [("a", "Bearer " + key_a), ("b", "Bearer " + key_b)])
        created = client.post("/api/files/new", json={"name": "credential fixture", "folder": str(area / "projects"), "filename": "fixture.ludo.json", "template": "outpost"}).json()["project"]
        identifier = created["project_id"]
        checked("generate_without_browser_key", client.post(
            f"/api/v2/projects/{identifier}/generate",
            json={"request_id": "credential-fixture", "expected_revision": created["revision"],
                  "profile_id": "fixture-a", "instructions": "fixture only",
                  "items": [{"name": "fixture character", "fields": ["name", "story"]}]},
        ).status_code == 202)
        for _ in range(100):
            jobs = client.get(f"/api/v2/projects/{identifier}/generation").json()
            if jobs and jobs[0]["status"] not in {"queued", "running"}:
                break
            time.sleep(0.1)
        checked("generation_pending_review", jobs[0]["status"] == "awaiting_review")
        checked("generation_received_stored_key", received[-1] == ("a", "Bearer " + key_a))
        changed = {**profiles[0], "endpoint": "http://127.0.0.1:1/v1"}
        copied = {**profiles[0], "id": "copy"}
        for label, p in [("changed_destination", changed), ("copied_profile", copied)]:
            count = len(received)
            checked(label, client.post("/api/models/test", json={"profile": p}).status_code == 422 and len(received) == count)
        checked("clear_one", client.delete("/api/workspace/model-profiles/fixture-a/credential").status_code == 200)
        info = client.get("/api/workspace").json()
        checked("other_key_retained", not info["credentials"]["saved"]["fixture-a"] and info["credentials"]["saved"]["fixture-b"])
        checked("cleared_key_cannot_probe", client.post("/api/models/test", json={"profile": profiles[0]}).status_code == 422)
        checked("session_override_remains_available", client.post("/api/models/test", json={"profile": profiles[0], "api_key": "temporary-fixture"}).status_code == 200)
        checked("session_override_not_saved", not client.get("/api/workspace").json()["credentials"]["saved"]["fixture-a"])
        checked("no_plaintext_in_local_json", all(
            all(key not in path.read_text(encoding="utf-8") for key in [key_a, key_b, "temporary-fixture"])
            for path in area.rglob("*.json")
        ))
        process.terminate()
        process.wait(timeout=10)
        process = launch()
        info = client.get("/api/workspace").json()
        checked("clear_survives_restart", not info["credentials"]["saved"]["fixture-a"] and info["credentials"]["saved"]["fixture-b"])
        report = {"transport": "packaged_exe_real_http_loopback_fixture", "external_model_called": False, "checks": checks}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"Passed {len(checks)} packaged credential checks; no external model called")
    finally:
        if process and process.poll() is None:
            process.terminate()
            process.wait(timeout=10)
        client.close()
        log.close()
        fixture.shutdown()
        fixture.server_close()


if __name__ == "__main__":
    main()
