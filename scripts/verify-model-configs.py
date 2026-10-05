"""Packaged multi-model HTTP verification using only localhost and dummy keys."""

import importlib.util
import io
import json
import subprocess
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

import httpx2 as httpx

ROOT = Path(__file__).resolve().parents[1]
AREA = ROOT / f".local-build/model-config-verification/{time.time_ns()}"
AREA.mkdir(parents=True)
REPORT = {
    "transport": "real_http_packaged_executable",
    "model": "localhost_protocol_fixture_not_a_model",
    "checks": [],
}
KEYS = {
    "fixture-a": "fixture-key-A-not-a-real-credential",
    "fixture-b": "fixture-key-B-not-a-real-credential",
}
spec = importlib.util.spec_from_file_location(
    "model_fixture", ROOT / "scripts/model-fixture.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
received = []


class IsolatedKeys(module.FixtureHandler):
    def do_POST(self):
        size = int(self.headers.get("content-length", "0"))
        if size > 1_000_000:
            self.send_error(413)
            return
        raw = self.rfile.read(size)
        data = json.loads(raw)
        model = data.get("model")
        if (
            model not in KEYS
            or self.headers.get("authorization") != "Bearer " + KEYS[model]
        ):
            self.send_response(401)
            self.end_headers()
            return
        received.append({"model": model, "correct_key": True})
        self.rfile = io.BytesIO(raw)
        super().do_POST()


fixture = ThreadingHTTPServer(("127.0.0.1", 4183), IsolatedKeys)
threading.Thread(target=fixture.serve_forever, daemon=True).start()
process = client = None


def check(name, value):
    assert value, name
    REPORT["checks"].append({"name": name, "passed": True})


def boot():
    with (AREA / "server.log").open("a", encoding="utf-8") as stream:
        proc = subprocess.Popen(
            [
                str(ROOT / "release/LudoNPC/LudoNPC.exe"),
                "--port",
                "4176",
                "--data-dir",
                str(AREA / "app"),
                "--project-dir",
                str(AREA / "projects"),
            ],
            cwd=AREA,
            stdout=stream,
            stderr=subprocess.STDOUT,
        )
    conn = httpx.Client(base_url="http://127.0.0.1:4176", timeout=15, trust_env=False)
    try:
        for _ in range(100):
            if proc.poll() is not None:
                raise RuntimeError("packaged service exited")
            try:
                if conn.get("/api/health").status_code == 200:
                    conn.get("/api/session")
                    return proc, conn
            except httpx.RequestError:
                pass
            time.sleep(0.1)
        raise RuntimeError("packaged service unavailable")
    except Exception:
        conn.close()
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=15)
        raise


def stop():
    global process, client
    if client:
        client.close()
    if process and process.poll() is None:
        process.terminate()
        process.wait(timeout=15)
    process = client = None


def workspace():
    return client.get("/api/workspace").json()


def put(p):
    result = client.put("/api/workspace/model-profiles", json=p)
    assert result.status_code == 200, result.text
    return result.json()


try:
    process, client = boot()
    check(
        "new_defaults_endpoint_in_packaged_openapi",
        "/api/workspace/model-defaults" in client.get("/openapi.json").json()["paths"],
    )
    a = {
        "id": "config-a",
        "name": "协议测试角色初稿",
        "endpoint": "http://127.0.0.1:4183/v1",
        "model": "fixture-a",
        "mode": "local",
        "max_tokens": 2048,
    }
    b = dict(
        a, id="config-b", name="协议测试对话精修", model="fixture-b", max_tokens=4096
    )
    put(a)
    put(b)
    check(
        "adding_second_profile_preserves_general_default",
        workspace()["active_profile_id"] == a["id"],
    )
    defaults = {
        "active_profile_id": a["id"],
        "purpose_defaults": {
            "character": a["id"],
            "story": a["id"],
            "dialogue": b["id"],
            "text": b["id"],
        },
    }
    result = client.put("/api/workspace/model-defaults", json=defaults)
    check(
        "purpose_defaults_save",
        result.status_code == 200
        and result.json()["purpose_defaults"] == defaults["purpose_defaults"],
    )
    for p in [a, b]:
        result = client.post(
            "/api/models/test", json={"profile": p, "api_key": KEYS[p["model"]]}
        )
        check(f"test_uses_own_key_{p['id']}", result.status_code == 200)
    result = client.post(
        "/api/models/test", json={"profile": b, "api_key": KEYS[a["model"]]}
    )
    check("different_profile_key_rejected", result.status_code == 502)
    check(
        "failed_test_recorded_without_raw_error",
        workspace()["model_profiles"][1]["last_test"]["status"] == "failed",
    )
    put(dict(b, enabled=False))
    check(
        "disable_prunes_only_matching_purposes",
        workspace()["purpose_defaults"] == {"character": a["id"], "story": a["id"]},
    )
    put(b)
    check(
        "reenable_does_not_steal_default", workspace()["active_profile_id"] == a["id"]
    )
    bad = client.put(
        "/api/workspace/model-defaults", json={"active_profile_id": "unknown"}
    )
    check(
        "unknown_default_rejected",
        bad.status_code == 422 and workspace()["active_profile_id"] == a["id"],
    )
    client.put("/api/workspace/model-defaults", json=defaults)
    created = client.post(
        "/api/files/new",
        json={
            "name": "多模型程序包验证",
            "template": "outpost",
            "folder": str(AREA / "projects"),
            "filename": "model-config.ludo.json",
        },
    ).json()
    identifier = created["project"]["project_id"]
    base = f"/api/v2/projects/{identifier}"
    for index, p in enumerate([a, b]):
        current = client.get(base).json()
        result = client.post(
            base + "/generate",
            json={
                "request_id": f"generation-{index}",
                "expected_revision": current["revision"],
                "profile_id": p["id"],
                "purpose": "story",
                "api_key": KEYS[p["model"]],
                "instructions": "本地协议验证",
                "items": [{"kind": "character", "name": f"协议角色{index}"}],
            },
        )
        check(f"submit_explicit_model_{index}", result.status_code == 202)
        for _ in range(100):
            jobs = client.get(base + "/generation").json()
            job = next(j for j in jobs if j["id"] == f"generation-{index}")
            if job["status"] not in {"queued", "running"}:
                break
            time.sleep(0.03)
        check(
            f"generated_draft_uses_selected_model_{index}",
            job["status"] == "awaiting_review"
            and job["profile_name"] == p["name"]
            and job["model"] == p["model"]
            and job["purpose"] == "story",
        )
    put(dict(b, name="已改名的测试配置", model="fixture-a"))
    client.delete("/api/workspace/model-profiles/config-b")
    archived = workspace()
    check(
        "archive_is_recoverable_and_exits_defaults",
        archived["model_profiles"][1]["archived"]
        and not archived["model_profiles"][1]["enabled"]
        and "dialogue" not in archived["purpose_defaults"],
    )
    current = client.get(base).json()
    denied = client.post(
        base + "/generate",
        json={
            "request_id": "disabled",
            "expected_revision": current["revision"],
            "profile_id": b["id"],
            "instructions": "不可选用",
            "items": [{"name": "不能生成"}],
        },
    )
    check("archived_model_cannot_be_submitted", denied.status_code == 422)
    history = client.get(base + "/generation").json()
    check(
        "history_keeps_original_name_and_model_after_edit_archive",
        history[1]["profile_name"] == b["name"]
        and history[1]["model"] == b["model"]
        and history[1]["model_endpoint"] == b["endpoint"],
    )
    result = client.post("/api/workspace/model-profiles/config-b/restore")
    check(
        "restore_same_id_and_parameters",
        result.status_code == 200
        and result.json()["model_profiles"][1]["enabled"]
        and result.json()["model_profiles"][1]["name"] == "已改名的测试配置",
    )
    client.put("/api/workspace/model-defaults", json=defaults)
    stop()
    process, client = boot()
    check(
        "defaults_and_profiles_survive_process_restart",
        workspace()["purpose_defaults"] == defaults["purpose_defaults"]
        and len(workspace()["model_profiles"]) == 2,
    )
    reopened = client.post(
        "/api/files/open", json={"path": str(AREA / "projects/model-config.ludo.json")}
    ).json()
    record = reopened["project"]["content"]["generation_history"][1]
    check(
        "original_task_provenance_survives_restart",
        record["model"] == b["model"] and record["profile_name"] == b["name"],
    )
    check(
        "dummy_keys_not_in_settings_projects_exports_logs",
        all(
            key not in path.read_text(encoding="utf-8")
            for path in AREA.rglob("*")
            if path.is_file() and path.suffix in {".json", ".log", ".bak"}
            for key in KEYS.values()
        )
        and all(key not in client.get(base + "/export").text for key in KEYS.values()),
    )
    check(
        "fixture_received_only_matching_keys",
        len(received) == 4 and all(item["correct_key"] for item in received),
    )
finally:
    stop()
    fixture.shutdown()
    fixture.server_close()

(ROOT / "docs/verification/model-config-package.json").write_text(
    json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"Passed {len(REPORT['checks'])} packaged multi-model HTTP checks (fixture only)")
