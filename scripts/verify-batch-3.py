"""Standalone Windows package rehearsal + saved branch restart verification."""

import json
import re
import subprocess
import time
from pathlib import Path

import httpx2 as httpx

ROOT = Path(__file__).resolve().parents[1]
AREA = ROOT / ".local-build/batch-3-package-verification"
AREA.mkdir(parents=True, exist_ok=True)
REPORT = {"transport": "real_http_packaged_executable", "checks": []}
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
    stream = (AREA / "server.log").open("a", encoding="utf-8")
    process = subprocess.Popen(
        COMMAND, cwd=AREA, stdout=stream, stderr=subprocess.STDOUT
    )
    stream.close()
    client = httpx.Client(base_url="http://127.0.0.1:4176", trust_env=False, timeout=10)
    try:
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("Packaged service exited before health check")
            try:
                if client.get("/api/health").status_code == 200:
                    client.get("/api/session")
                    return process, client
            except httpx.RequestError:
                pass
            time.sleep(0.1)
        raise RuntimeError("Packaged service did not become ready")
    except Exception:
        process.terminate()
        process.wait(timeout=10)
        client.close()
        raise


process, client = start()
try:
    health = client.get("/api/health").json()
    check(
        "batch_three_capabilities",
        health["batch"] == 3
        and health["story_execution"]
        and not health["model_generation"],
    )
    page = client.get("/")
    check("bundled_frontend", page.status_code == 200)
    for extension, attr in [("js", "src"), ("css", "href")]:
        asset = re.search(rf'{attr}="([^" ]+\.{extension})"', page.text).group(1)
        check(f"bundled_{extension}", client.get(asset).status_code == 200)
    directives = {
        v.split()[0]: v.split()[1:]
        for v in page.headers["content-security-policy"].split(";")
    }
    check("styles_allowed_by_csp", "'self'" in directives["style-src"])
    filename = f"rehearsal-{time.time_ns()}.ludo.json"
    created = client.post(
        "/api/files/new",
        json={
            "name": "独立预演验收",
            "folder": str(AREA / "projects"),
            "filename": filename,
            "template": "outpost",
        },
    )
    check("create_local_project", created.status_code == 201)
    document = created.json()["project"]
    identifier = document["project_id"]
    base = f"/api/v2/projects/{identifier}"
    path = Path(created.json()["file"]["path"])

    def simulate(tick, **extra):
        response = client.post(
            base + "/simulate",
            json={
                "expected_content_revision": document["content_revision"],
                "at_tick": tick,
                **extra,
            },
        )
        assert response.status_code == 200, response.text
        return response.json()

    before = simulate(2)
    check(
        "no_future_knowledge",
        before["state"]["variables"]["supplies"] == 2
        and not before["state"]["characters"]["keeper"]["known_fact_ids"],
    )
    check(
        "unavailable_option_explained",
        not before["dialogues"][0]["options"][0]["available"],
    )
    edits = [
        {
            "type": "patch_entity",
            "target": {"kind": "event", "id": "arrival"},
            "changes": {
                "scheduled_at": 4,
                "condition": {"op": "scene", "location_id": "gate"},
            },
        }
    ]
    response = client.post(
        base + "/commands",
        json={"expected_revision": document["revision"], "commands": edits},
    )
    check("author_scene_condition_and_reschedule", response.status_code == 200)
    document = response.json()
    check("condition_blocks_event", simulate(4)["events"][0]["status"] == "blocked")
    records = [
        {
            "tick": 4,
            "dialogue_id": "gate-conversation",
            "option_id": "ask-arrival",
            "record_id": "selection-1",
            "sequence": 1,
        }
    ]
    scenes = [{"tick": 4, "location_id": "gate", "sequence": 0}]
    after = simulate(4, choices=records, scene_changes=scenes)
    check(
        "scene_triggers_event",
        after["state"]["variables"]["supplies"] == 7
        and after["events"][0]["status"] == "occurred",
    )
    check(
        "dialogue_branch_target", after["dialogues"][0]["node_id"] == "arrival-answer"
    )
    check(
        "causes_and_before_after",
        any(r["kind"] == "event" and len(r["changes"]) == 2 for r in after["log"]),
    )
    rewind = simulate(2, choices=records, scene_changes=scenes)
    check(
        "rewind_filters_future_scene_and_choice",
        rewind["state"]["scene_id"] is None
        and rewind["dialogues"][0]["node_id"] == "greeting"
        and rewind["state"]["variables"]["supplies"] == 2,
    )
    low = simulate(2, variable_overrides={"supplies": 0})
    check(
        "independent_branch_rule_and_text",
        low["texts"][0]["available"]
        and low["state"]["characters"]["keeper"]["behavior"] == "限制访客进入储水间",
    )
    check(
        "branch_isolation",
        simulate(2)
        == before
        | {
            "content_revision": document["content_revision"],
            "events": simulate(2)["events"],
        },
    )
    case = {
        "id": "case-recorded",
        "name": "东门分支",
        "at_tick": 4,
        "choices": records,
        "scene_changes": scenes,
    }
    saved = client.post(
        base + "/commands",
        json={
            "expected_revision": document["revision"],
            "commands": [{"type": "put_simulation_case", "case": case}],
        },
    )
    check("branch_input_command", saved.status_code == 200)
    document = saved.json()
    check(
        "save_real_file",
        client.post(
            base + "/save", json={"expected_revision": document["revision"]}
        ).status_code
        == 200,
    )
    check(
        "rehearsal_does_not_change_author_definitions",
        document["content"]["initial_state"]["variables"] == {}
        and document["content"]["initial_state"]["characters"]["keeper"][
            "known_fact_ids"
        ]
        == [],
    )
    check(
        "revision_guard",
        client.post(
            base + "/simulate", json={"expected_content_revision": 1}
        ).status_code
        == 409,
    )
    recorded = client.post(
        base + "/simulate",
        json={
            "expected_content_revision": document["content_revision"],
            "case_id": "case-recorded",
        },
    ).json()
finally:
    client.close()
    process.terminate()
    process.wait(timeout=10)

process, client = start()
try:
    info = client.get("/api/workspace").json()
    check("recent_file_survives_restart", info["last_project"] == str(path))
    opened = client.post("/api/files/open", json={"path": str(path)})
    check(
        "open_after_package_process_restart",
        opened.status_code == 200 and opened.json()["project"] == document,
    )
    rerun = client.post(
        base + "/simulate",
        json={
            "expected_content_revision": document["content_revision"],
            "case_id": "case-recorded",
        },
    )
    check(
        "identical_replay_after_restart",
        rerun.status_code == 200 and rerun.json() == recorded,
    )
    exported = client.get(base + "/export").json()
    check(
        "export_preserves_branch_inputs",
        any(
            c["id"] == "case-recorded"
            and c["scene_changes"][0]["location_id"] == "gate"
            for c in exported["content"]["simulation_cases"]
        ),
    )
finally:
    client.close()
    process.terminate()
    process.wait(timeout=10)

output = ROOT / "docs/verification/batch-3-package.json"
output.write_text(
    json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"Passed {len(REPORT['checks'])} batch-three packaged process / real HTTP checks")
