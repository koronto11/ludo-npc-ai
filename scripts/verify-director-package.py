"""Verify scene planning through the packaged server, using an isolated local file."""

import json
import subprocess
import time
from pathlib import Path

import httpx2 as httpx

ROOT = Path(__file__).resolve().parents[1]
AREA = ROOT / ".local-build/director-package-verification"
AREA.mkdir(parents=True, exist_ok=True)
checks = []


def checked(name, response, status=200):
    assert response.status_code == status, (name, response.text)
    checks.append(name)
    return response.json()


with (AREA / "server.log").open("w", encoding="utf-8") as log:
    process = subprocess.Popen(
        [
            str(ROOT / "release/npcs-ai-studio-preview/NPCsAIStudio/NPCsAIStudio.exe"),
            "--port",
            "4186",
            "--data-dir",
            str(AREA / "app"),
            "--project-dir",
            str(AREA / "projects"),
        ],
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    try:
        with httpx.Client(
            base_url="http://127.0.0.1:4186", trust_env=False, timeout=10
        ) as client:
            for _ in range(100):
                assert process.poll() is None, "Packaged server stopped"
                try:
                    if client.get("/api/health").status_code == 200:
                        break
                except httpx.RequestError:
                    pass
                time.sleep(0.1)
            checked("session", client.get("/api/session"))
            filename = f"camp-{time.time_ns()}.ludo.json"
            project = checked(
                "campfire_template",
                client.post(
                    "/api/files/new",
                    json={
                        "name": "场景导演台验收",
                        "folder": str(AREA / "projects"),
                        "filename": filename,
                        "template": "campfire",
                    },
                ),
                201,
            )["project"]
            identifier = project["project_id"]
            assert len(project["content"]["levels"][0]["appearances"]) == 7
            prefix = f"/api/v2/projects/{identifier}"
            result = checked(
                "conditional_entry",
                client.post(
                    prefix + "/simulate",
                    json={
                        "expected_content_revision": project["content_revision"],
                        "level_id": "camp-level",
                        "location_id": "camp-fire",
                        "at_tick": 10,
                        "variable_overrides": {"camp-injured": True},
                    },
                ),
            )
            assert (
                next(d for d in result["dialogues"] if d["id"] == "camp-fire-dialogue")[
                    "node_id"
                ]
                == "injury"
            )
            result = checked(
        "scene_scope",
                client.post(
                    prefix + "/simulate",
                    json={
                        "expected_content_revision": project["content_revision"],
                        "level_id": "camp-level",
                        "location_id": "camp-clinic",
                        "at_tick": 25,
                    },
                ),
            )
            assert next(
                d for d in result["dialogues"] if d["id"] == "camp-clinic-dialogue"
            )["available"]
            assert not next(
                d for d in result["dialogues"] if d["id"] == "camp-fire-dialogue"
            )["available"]
            project = checked(
                "dialogue_layout",
                client.post(
                    prefix + "/commands",
                    json={
                        "expected_revision": project["revision"],
                        "commands": [
                            {
                                "type": "put_dialogue_layout",
                                "dialogue_id": "camp-fire-dialogue",
                                "positions": {"greeting": {"x": 380, "y": 90}},
                            }
                        ],
                    },
                ),
            )
            checked(
                "save",
                client.post(
                    prefix + "/save", json={"expected_revision": project["revision"]}
                ),
            )
            checked("close", client.post(prefix + "/close", json={"discard": False}))
            reopened = checked(
                "reopen",
                client.post(
                    "/api/files/open", json={"path": str(AREA / "projects" / filename)}
                ),
            )["project"]
            assert reopened["content"]["levels"] == project["content"]["levels"]
            assert (
                reopened["editor"]["dialogue_layouts"]
                == project["editor"]["dialogue_layouts"]
            )
    finally:
        process.terminate()
        process.wait(timeout=10)

report = {
    "transport": "real_http_packaged_executable",
    "external_model_called": False,
    "checks": checks,
}
(ROOT / "docs/verification/director-package.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"Passed {len(checks)} director packaged HTTP checks")
