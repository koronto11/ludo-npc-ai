"""Real packaged HTTP checks against a localhost protocol fixture, NOT a model."""

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import httpx2 as httpx

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--report", default="docs/verification/batch-4-package.json")
REPORT_PATH = ROOT / parser.parse_args().report
AREA = ROOT / f".local-build/batch-4-package-verification/{time.time_ns()}"
AREA.mkdir(parents=True)
REPORT = {
    "transport": "real_http_packaged_executable",
    "model": "localhost_protocol_fixture_not_a_model",
    "checks": [],
}
KEY = "fixture-session-key-not-a-real-credential"
COMMAND = [
    str(ROOT / "release/npcs-ai-studio-preview/NPCsAIStudio/NPCsAIStudio.exe"),
    "--port",
    "4176",
    "--data-dir",
    str(AREA / "app"),
    "--project-dir",
    str(AREA / "projects"),
]


def check(name, test):
    assert test, name
    REPORT["checks"].append({"name": name, "passed": True})


def start():
    with (AREA / "server.log").open("a", encoding="utf-8") as stream:
        process = subprocess.Popen(
            COMMAND, cwd=AREA, stdout=stream, stderr=subprocess.STDOUT
        )
    client = httpx.Client(base_url="http://127.0.0.1:4176", trust_env=False, timeout=15)
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("Packaged service exited")
            try:
                if client.get("/api/health").status_code == 200:
                    client.get("/api/session")
                    return process, client
            except httpx.RequestError:
                pass
            time.sleep(0.1)
        raise RuntimeError("Packaged service did not become ready")
    except Exception:
        stop(process, client)
        raise


def stop(process, client=None):
    if client:
        client.close()
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=15)


with (AREA / "fixture.log").open("w", encoding="utf-8") as stream:
    fixture = subprocess.Popen(
        [sys.executable, str(ROOT / "scripts/model-fixture.py"), "--port", "4181"],
        stdout=stream,
        stderr=subprocess.STDOUT,
    )
process = client = None
try:
    process, client = start()
    health = client.get("/api/health").json()
    check(
        "batch_four_capabilities",
        health["batch"] == 4
        and health["model_generation"]
        and health["draft_review"]
        and health["story_execution"],
    )
    page = client.get("/")
    check("bundled_frontend", page.status_code == 200)
    for extension, attr in [("js", "src"), ("css", "href")]:
        asset = re.search(rf'{attr}="([^" ]+\.{extension})"', page.text).group(1)
        check(f"bundled_{extension}", client.get(asset).status_code == 200)
    profile = {
        "id": "package-fixture",
        "name": "本机协议测试",
        "mode": "local",
        "endpoint": "http://127.0.0.1:4181/v1",
        "model": "protocol-fixture-not-a-model",
        "stream": True,
        "json_mode": True,
        "retry_limit": 0,
    }
    check(
        "profile_without_key",
        client.put("/api/workspace/model-profiles", json=profile).status_code == 200,
    )
    connected = client.post(
        "/api/models/test", json={"profile": profile, "api_key": KEY}
    )
    check(
        "packaged_adapter_connection_stream",
        connected.status_code == 200
        and connected.json()["usage"]["total_tokens"] == 72,
    )
    created = client.post(
        "/api/files/new",
        json={
            "name": "第四批程序包验收",
            "folder": str(AREA / "projects"),
            "filename": "package-generation.ludo.json",
            "template": "outpost",
        },
    )
    check("create_local_project", created.status_code == 201)
    project = created.json()["project"]
    path = Path(created.json()["file"]["path"])
    base = f"/api/v2/projects/{project['project_id']}"

    def current():
        response = client.get(base)
        assert response.status_code == 200, response.text
        return response.json()

    def commands(items, status=200):
        response = client.post(
            base + "/commands",
            json={"expected_revision": current()["revision"], "commands": items},
        )
        assert response.status_code == status, response.text
        return response.json()

    def save():
        response = client.post(
            base + "/save", json={"expected_revision": current()["revision"]}
        )
        assert response.status_code == 200, response.text

    def generate(identifier, items, instructions="按世界规则生成", wait=True):
        document = current()
        response = client.post(
            base + "/generate",
            json={
                "request_id": identifier,
                "expected_revision": document["revision"],
                "profile_id": profile["id"],
                "api_key": KEY,
                "instructions": instructions,
                "items": items,
                "scenario": {
                    "expected_content_revision": document["content_revision"],
                    "at_tick": 2,
                },
            },
        )
        assert response.status_code == 202, response.text
        assert KEY not in response.text
        if not wait:
            return response.json()
        for _ in range(150):
            jobs = client.get(base + "/generation").json()
            job = next(j for j in jobs if j["id"] == identifier)
            if job["status"] not in {"queued", "running"}:
                return job
            time.sleep(0.1)
        raise RuntimeError("Generation did not finish")

    def compare(identifier):
        return client.get(base + f"/drafts/{identifier}/review").json()

    def accept(identifier, values=None):
        view = compare(identifier)
        commands(
            [
                {
                    "type": "review_draft",
                    "draft_id": identifier,
                    "action": "accept",
                    "expected_author_hash": view["author_hash"],
                    "values": values
                    if values is not None
                    else {
                        f["field"]: f["candidate"]
                        for f in view["fields"]
                        if not f["protected"]
                    },
                }
            ]
        )
        save()

    commands(
        [{"type": "review_draft", "draft_id": "keeper-story-draft", "action": "reject"}]
    )
    save()
    job = generate(
        "package-story",
        [
            {
                "kind": "character",
                "name": "夏岚",
                "target_id": "keeper",
                "fields": ["story"],
            }
        ],
    )
    check(
        "real_stream_to_pending_draft",
        job["status"] == "awaiting_review" and len(job["draft_ids"]) == 1,
    )
    check(
        "pending_does_not_mutate_author",
        current()["content"]["characters"][0]["story"] == "",
    )
    draft_id = job["draft_ids"][0]
    check(
        "draft_is_on_disk",
        any(
            d["id"] == draft_id
            for d in json.loads(path.read_text(encoding="utf-8"))["content"]["drafts"]
        ),
    )
    commands(
        [
            {
                "type": "patch_entity",
                "target": {"kind": "character", "id": "keeper"},
                "changes": {"goals": ["人工目标保持"]},
            }
        ]
    )
    view = compare(draft_id)
    check("author_change_makes_draft_stale", view["stale"])
    commands(
        [
            {
                "type": "review_draft",
                "draft_id": draft_id,
                "action": "accept",
                "expected_author_hash": view["author_hash"],
                "values": {"story": "未重新比较"},
            }
        ],
        422,
    )
    check("stale_accept_blocked", current()["content"]["characters"][0]["story"] == "")
    commands(
        [
            {
                "type": "rebase_draft",
                "draft_id": draft_id,
                "expected_author_hash": view["author_hash"],
            }
        ]
    )
    accept(draft_id, {"story": "作者审核后的故事"})
    actor = current()["content"]["characters"][0]
    check(
        "selective_apply_preserves_manual_and_confirmed",
        actor["story"] == "作者审核后的故事"
        and actor["goals"] == ["人工目标保持"]
        and actor["role"] == "驿站守门人",
    )
    accepted = next(d for d in current()["content"]["drafts"] if d["id"] == draft_id)
    commands([{"type": "put_draft", "draft": {**accepted, "status": "pending"}}], 422)
    check(
        "reviewed_history_cannot_be_resurrected",
        compare(draft_id)["status"] == "accepted",
    )

    job = generate(
        "package-five",
        [{"kind": "character", "name": f"测试角色{i}"} for i in range(5)],
    )
    check(
        "five_generated_separate_from_formal",
        len(job["draft_ids"]) == 5 and len(current()["content"]["characters"]) == 1,
    )
    views = [compare(i) for i in job["draft_ids"]]
    commands(
        [
            {
                "type": "review_draft",
                "draft_id": v["draft"]["id"],
                "action": "accept",
                "expected_author_hash": v["author_hash"],
                "values": {
                    f["field"]: f["candidate"]
                    for f in v["fields"]
                    if not f["protected"]
                },
            }
            for v in views
        ]
    )
    save()
    check("atomic_bulk_accept_five", len(current()["content"]["characters"]) == 6)
    job = generate(
        "package-dialogue",
        [{"kind": "dialogue", "name": "测试生成对话", "character_id": "keeper"}],
    )
    accept(job["draft_ids"][0])
    graph = next(
        d for d in current()["content"]["dialogues"] if d["name"] == "测试生成对话"
    )
    simulation = client.post(
        base + "/simulate",
        json={"expected_content_revision": current()["content_revision"], "at_tick": 2},
    ).json()
    check(
        "generated_dialogue_has_valid_options",
        len(graph["nodes"]) == 2
        and graph["nodes"][0]["options"][0]["target_node_id"] == graph["nodes"][1]["id"]
        and simulation["complete"],
    )
    job = generate(
        "package-letter",
        [{"kind": "text", "name": "测试信件", "character_id": "keeper"}],
    )
    accept(job["draft_ids"][0])
    check(
        "non_dialogue_text_generation",
        any(
            t["name"] == "测试信件"
            and t["text_type"] == "letter"
            and t["author_id"] == "keeper"
            for t in current()["content"]["texts"]
        ),
    )
    partial = generate(
        "package-partial",
        [
            {"kind": "character", "name": "成功角色"},
            {"kind": "character", "name": "失败角色"},
        ],
    )
    check(
        "partial_failure_keeps_success",
        len(partial["draft_ids"]) == 1
        and len(partial["failures"]) == 1
        and any(i["status"] == "failed" for i in partial["items"]),
    )
    retry = generate("package-retry", [{"kind": "character", "name": "失败角色"}])
    check(
        "explicit_retry_only_failed_scope",
        retry["status"] == "failed"
        and retry["total"] == 1
        and len(current()["content"]["characters"]) == 6,
    )
    before = len(current()["content"]["drafts"])
    generate(
        "package-cancel",
        [{"kind": "character", "name": f"取消角色{i}"} for i in range(10)],
        "慢速协议测试",
        wait=False,
    )
    with client.stream("GET", base + "/generation/events") as events:
        first = next(line for line in events.iter_lines() if line.startswith("data: "))
        check(
            "actual_sse_progress_without_secret",
            events.status_code == 200
            and "package-cancel" in first
            and KEY not in first,
        )
    cancelled = client.post(base + "/generation/package-cancel/cancel")
    check(
        "cancel_running_and_queued",
        cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled",
    )
    check(
        "cancel_preserves_existing_drafts",
        len(current()["content"]["drafts"]) == before,
    )
    generate(
        "package-interrupted",
        [{"kind": "character", "name": "中断角色"}],
        "慢速协议测试",
        wait=False,
    )
    stop(process, client)
    process = client = None
    stop(fixture)
    process, client = start()
    opened = client.post("/api/files/open", json={"path": str(path)})
    check("reopen_after_process_interruption", opened.status_code == 200)
    recovered = next(
        j
        for j in client.get(base + "/generation").json()
        if j["id"] == "package-interrupted"
    )
    check(
        "interrupted_not_auto_resent",
        recovered["status"] == "interrupted" and not recovered["draft_ids"],
    )
    failed_history = next(
        j
        for j in client.get(base + "/generation").json()
        if j["id"] == "package-partial"
    )
    check(
        "failed_items_survive_restart_for_retry",
        failed_history["items"] == partial["items"],
    )
    check(
        "formal_content_survives_restart",
        len(current()["content"]["characters"]) == 6
        and current()["content"]["characters"][0]["story"] == "作者审核后的故事",
    )
    settings = client.get("/api/workspace").json()
    check(
        "connection_profile_survives_without_key",
        settings["active_profile_id"] == profile["id"]
        and KEY not in json.dumps(settings),
    )
    exported = client.get(base + "/export")
    check(
        "export_excludes_credentials",
        exported.status_code == 200 and KEY not in exported.text,
    )
    check(
        "all_local_json_and_logs_exclude_key",
        all(
            KEY not in p.read_text(encoding="utf-8")
            for p in AREA.rglob("*")
            if p.is_file() and p.suffix in {".json", ".log", ".bak"}
        ),
    )
finally:
    if process:
        stop(process, client)
    stop(fixture)

REPORT_PATH.write_text(
    json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(
    f"Passed {len(REPORT['checks'])} batch-four packaged process / real HTTP checks (fixture, NOT a model)"
)
