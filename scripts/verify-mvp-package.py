"""Offline packaged-process acceptance, including occupied default port and restart."""

import json
import re
import socket
import subprocess
import time
from pathlib import Path

import httpx2 as httpx
from ludo_npc.domain.models import Project

ROOT = Path(__file__).resolve().parents[1]
AREA = ROOT / ".local-build/mvp-package-verification" / str(time.time_ns())
EXE = ROOT / "release/npcs-ai-studio-preview/NPCsAIStudio/NPCsAIStudio.exe"
checks = []


def check(name, response, status=200):
    assert response.status_code == status, (
        name,
        response.status_code,
        response.text[:1000],
    )
    checks.append(name)
    return (
        response.json()
        if "application/json" in response.headers.get("content-type", "")
        else response.text
    )


def start(index):
    log_path = AREA / f"server-{index}.log"
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [
            str(EXE),
            "--no-browser",
            "--data-dir",
            str(AREA / "app"),
            "--project-dir",
            str(AREA / "projects"),
        ],
        cwd=AREA,
        stdout=log,
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    try:
        for _ in range(200):
            assert process.poll() is None, log_path.read_text(
                encoding="utf-8", errors="replace"
            )
            match = re.search(
                r"http://127\.0\.0\.1:(\d+)/",
                log_path.read_text(encoding="utf-8", errors="replace"),
            )
            if match:
                port = int(match.group(1))
                client = httpx.Client(
                    base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=20
                )
                try:
                    if client.get("/api/health").status_code == 200:
                        check(f"session_{index}", client.get("/api/session"))
                        return process, client, log, port
                except httpx.RequestError:
                    pass
                client.close()
            time.sleep(0.05)
        raise AssertionError("Package startup timed out")
    except BaseException:
        process.terminate()
        process.wait(timeout=10)
        log.close()
        raise


def stop(process, client, log):
    client.close()
    process.terminate()
    process.wait(timeout=10)
    log.close()


def main():
    AREA.mkdir(parents=True, exist_ok=True)
    blocker = socket.socket()
    try:
        try:
            blocker.bind(("127.0.0.1", 4174))
            blocker.listen()
        except OSError:
            # A pre-existing local process also exercises fallback; never stop it.
            blocker.close()
        process, client, log, port = start(1)
        try:
            assert port != 4174
            checks.append("occupied_default_port_falls_back")
            html = check("bundled_frontend", client.get("/"))
            asset = re.search(r'src="([^\"]+\.js)"', html).group(1)
            check("bundled_javascript", client.get(asset))
            css = re.search(r'href="([^\"]+\.css)"', html).group(1)
            check("bundled_css", client.get(css))
            created = check(
                "camp_project",
                client.post(
                    "/api/files/new",
                    json={
                        "name": "MVP 程序包验收",
                        "folder": str(AREA / "projects"),
                        "filename": f"mvp-{time.time_ns()}.ludo.json",
                        "template": "campfire",
                    },
                ),
                201,
            )
            project = created["project"]
            pid = project["project_id"]
            prefix = f"/api/v2/projects/{pid}"
            path = created["file"]["path"]
            project = check(
                "profile_edit",
                client.post(
                    prefix + "/commands",
                    json={
                        "expected_revision": project["revision"],
                        "commands": [
                            {
                                "type": "patch_entity",
                                "target": {"kind": "character", "id": "camp-xialan"},
                                "changes": {"story": "程序包故事保存验证"},
                            }
                        ],
                    },
                ),
            )
            check("manual_history", client.get(prefix + "/edit-history"))
            undone = check(
                "undo",
                client.post(
                    prefix + "/edit-history",
                    json={
                        "expected_revision": project["revision"],
                        "direction": "undo",
                    },
                ),
            )["project"]
            assert undone["content"]["characters"][0]["story"] != "程序包故事保存验证"
            project = check(
                "redo",
                client.post(
                    prefix + "/edit-history",
                    json={"expected_revision": undone["revision"], "direction": "redo"},
                ),
            )["project"]
            check(
                "save_after_redo",
                client.post(
                    prefix + "/save", json={"expected_revision": project["revision"]}
                ),
            )
            library = check("builtin_templates", client.get("/api/templates"))
            assert len(library["items"]) == 6
            library = check(
                "save_custom_template",
                client.post(
                    "/api/templates",
                    json={
                        "project_id": pid,
                        "expected_revision": project["revision"],
                        "library_revision": library["revision"],
                        "source_kind": "character",
                        "source_id": "camp-xialan",
                        "name": "程序包本地人物模板",
                    },
                ),
                200,
            )
            custom_id = library["items"][-1]["id"]
            library = check(
                "archive_template",
                client.post(
                    f"/api/templates/{custom_id}/archive",
                    json={"library_revision": library["revision"], "archived": True},
                ),
            )
            check(
                "restore_template",
                client.post(
                    f"/api/templates/{custom_id}/archive",
                    json={"library_revision": library["revision"], "archived": False},
                ),
            )
            for fmt in ("markdown", "csv", "project"):
                value = check(
                    f"export_{fmt}",
                    client.post(
                        prefix + "/handoff",
                        json={
                            "expected_revision": project["revision"],
                            "format": fmt,
                            "level_id": None if fmt == "project" else "camp-level",
                        },
                    ),
                )
                assert "程序包故事保存验证" in value["text"] or fmt == "csv"
                if fmt == "project":
                    assert Project.model_validate_json(value["text"]).project_id == pid
            check(
                "stale_undo_rejected",
                client.post(
                    prefix + "/edit-history",
                    json={"expected_revision": undone["revision"], "direction": "undo"},
                ),
                409,
            )
            check("recovery_points", client.get(prefix + "/recovery"))
        finally:
            stop(process, client, log)
        process, client, log, second_port = start(2)
        try:
            reopened = check(
                "restart_open_file", client.post("/api/files/open", json={"path": path})
            )["project"]
            assert reopened["content"]["characters"][0]["story"] == "程序包故事保存验证"
            assert (
                check("session_history_resets", client.get(prefix + "/edit-history"))[
                    "undo_count"
                ]
                == 0
            )
            library = check("templates_survive_restart", client.get("/api/templates"))
            assert any(
                row["id"] == custom_id and not row["archived"]
                for row in library["items"]
            )
            restored = check(
                "backup_restore",
                client.post(
                    prefix + "/restore",
                    json={
                        "expected_revision": reopened["revision"],
                        "point_id": "previous",
                    },
                ),
            )["project"]
            assert restored["content"]["characters"][0]["story"] != "程序包故事保存验证"
            check(
                "restored_file_is_valid",
                client.post(
                    "/api/v2/projects/validate",
                    json={
                        "document": json.loads(Path(path).read_text(encoding="utf-8"))
                    },
                ),
            )
            # Explicitly requested ports fail clearly instead of connecting to an unrelated process.
            result = subprocess.run(
                [
                    str(EXE),
                    "--port",
                    str(second_port),
                    "--no-browser",
                    "--data-dir",
                    str(AREA / "port-error-app"),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=20,
                creationflags=subprocess.CREATE_NO_WINDOW,
                check=False,
            )
            assert result.returncode == 1
            assert str(second_port).encode() in result.stdout
            checks.append("explicit_port_conflict_clear_exit")
        finally:
            stop(process, client, log)
    finally:
        blocker.close()
    report = {
        "transport": "real_http_packaged_executable",
        "real_models": False,
        "checks": checks,
        "passed": len(checks),
    }
    (ROOT / "docs/verification/mvp-package-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
