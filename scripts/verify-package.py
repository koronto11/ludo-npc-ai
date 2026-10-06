"""Run the packaged executable twice and exercise real local-file APIs."""

import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import httpx2 as httpx

ROOT = Path(__file__).resolve().parents[1]
AREA = Path(os.environ.get("NPCS_PACKAGE_AREA") or os.environ.get("LUDO_PACKAGE_AREA", str(ROOT / ".local-build/package-verification")))
AREA.mkdir(parents=True, exist_ok=True)
REPORT = {"transport": "real_http_packaged_executable", "checks": []}
COMMAND = [
    os.environ.get("NPCS_PACKAGE_PATH") or os.environ.get("LUDO_PACKAGE_PATH", str(ROOT / "release/npcs-ai-studio-preview/NPCsAIStudio/NPCsAIStudio.exe")),
    "--no-browser",
    "--port",
    "4176",
    "--data-dir",
    str(AREA / "app"),
    "--project-dir",
    str(AREA / "projects"),
]


def start():
    process = subprocess.Popen(
        COMMAND,
        cwd=AREA,
        stdout=(AREA / "server.log").open("a", encoding="utf-8"),
        stderr=subprocess.STDOUT,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    client = httpx.Client(base_url="http://127.0.0.1:4176", trust_env=False, timeout=10)
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError((AREA / "server.log").read_text(encoding="utf-8"))
        try:
            if client.get("/api/health").status_code == 200:
                client.get("/api/session")
                return process, client
        except httpx.RequestError:
            pass
        time.sleep(0.1)
    process.terminate()
    raise RuntimeError("Package failed to start")


def checked(name, response, expected=200):
    assert response.status_code == expected, (name, response.text)
    REPORT["checks"].append({"name": name, "passed": True, "status": expected})
    return (
        response.json()
        if response.headers.get("content-type", "").startswith("application/json")
        else response.text
    )


process, client = start()
try:
    REPORT["capabilities"] = checked("packaged_health", client.get("/api/health"))
    info_before_language = checked("application_language_default", client.get("/api/workspace"))
    assert info_before_language["ui_language"] == "zh"
    checked("save_english_preference", client.put("/api/workspace/preferences", json={"ui_language": "en"}))
    language_info = checked("language_changes_only_preference", client.get("/api/workspace"))
    assert language_info["ui_language"] == "en"
    assert {k:v for k,v in language_info.items() if k != "ui_language"} == {k:v for k,v in info_before_language.items() if k != "ui_language"}
    checked("unsupported_language_refused", client.put("/api/workspace/preferences", json={"ui_language": "fr"}), 422)
    for language in ("zh", "en"):
        manual = Path(COMMAND[0]).parent / f"user-guide-{language}.md"
        assert manual.is_file() and len(manual.read_text(encoding="utf8")) > 5000
    page = client.get("/")
    html = checked("bundled_frontend", page)
    import re

    asset = re.search(r'src="([^"]+\.js)"', html).group(1)
    checked("bundled_javascript", client.get(asset))
    stylesheet = re.search(r'href="([^" ]+\.css)"', html).group(1)
    css_response = client.get(stylesheet)
    css = checked("bundled_stylesheet", css_response)
    assert (
        css_response.headers["content-type"].startswith("text/css") and len(css) > 1000
    )
    directives = {
        parts[0]: parts[1:]
        for directive in page.headers["content-security-policy"].split(";")
        if (parts := directive.split())
    }
    assert (
        "'self'" in directives["style-src"]
        and "'unsafe-inline'" in directives["style-src"]
    )
    REPORT["checks"].append(
        {"name": "csp_allows_bundled_styles_and_node_positions", "passed": True}
    )
    filename = f"package-{time.time_ns()}.ludo.json"
    result = checked(
        "new_local_project",
        client.post(
            "/api/files/new",
            json={
                "name": "程序包验证",
                "folder": str(AREA / "projects"),
                "filename": filename,
                "template": "outpost",
            },
        ),
        201,
    )
    identifier = result["project"]["project_id"]
    path = Path(result["file"]["path"])
    original = path.read_bytes()
    commands = [
        {
            "type": "patch_entity",
            "target": {"kind": "character", "id": "keeper"},
            "changes": {"goals": ["程序包保存后重新打开"]},
        },
        {
            "type": "move_node",
            "canvas_id": "outpost-board",
            "target": {"kind": "character", "id": "keeper"},
            "position": {"x": 800, "y": 320},
        },
    ]
    updated = checked(
        "edit_content_and_layout",
        client.post(
            f"/api/v2/projects/{identifier}/commands",
            json={"expected_revision": 1, "commands": commands},
        ),
    )
    checked(
        "save_local_file",
        client.post(
            f"/api/v2/projects/{identifier}/save",
            json={"expected_revision": updated["revision"]},
        ),
    )
    assert Path(str(path) + ".bak").read_bytes() == original
    REPORT["checks"].append({"name": "backup_preserves_previous_file", "passed": True})
    assert json.loads(path.read_text(encoding="utf-8"))["content"]["characters"][0][
        "goals"
    ] == ["程序包保存后重新打开"]
    assert checked(
        "recovery_points", client.get(f"/api/v2/projects/{identifier}/recovery")
    )
finally:
    client.close()
    process.terminate()
    process.wait(timeout=10)

process, client = start()
try:
    info = checked("recent_projects_survive_restart", client.get("/api/workspace"))
    assert info["last_project"] == str(path)
    opened = checked(
        "reopen_after_process_restart",
        client.post("/api/files/open", json={"path": str(path)}),
    )
    assert opened["project"] == updated
    REPORT["checks"].append(
        {"name": "content_and_coordinates_survive_restart", "passed": True}
    )
    restored = checked(
        "restore_previous_version",
        client.post(
            f"/api/v2/projects/{identifier}/restore",
            json={"expected_revision": updated["revision"], "point_id": "previous"},
        ),
    )
    assert restored["project"]["content"]["characters"][0]["goals"] != [
        "程序包保存后重新打开"
    ]
    copy = path.with_name(filename.replace(".ludo.json", "-copy.ludo.json"))
    checked(
        "save_as_new_file",
        client.post(
            f"/api/v2/projects/{identifier}/save",
            json={
                "expected_revision": restored["project"]["revision"],
                "path": str(copy),
            },
        ),
    )
    assert path.exists() and copy.exists()
    checked(
        "existing_target_not_overwritten",
        client.post(
            f"/api/v2/projects/{identifier}/save",
            json={
                "expected_revision": restored["project"]["revision"],
                "path": str(path),
            },
        ),
        409,
    )
    folder_name = f"目录验证-{time.time_ns()}"
    managed = checked("new_managed_folder", client.post("/api/files/new", json={
        "name": folder_name, "folder": str(AREA / "projects"),
        "filename": "作品.ludo.json", "template": "campfire", "layout": "folder",
    }), 201)
    folder_id = managed["project"]["project_id"]
    folder_path = Path(managed["file"]["path"])
    assert managed["file"]["managed_folder"] and folder_path.parent.name == folder_name
    assert (folder_path.parent / "exports").is_dir()
    old_bytes = folder_path.read_bytes()
    edited = checked("edit_managed_project", client.post(f"/api/v2/projects/{folder_id}/commands", json={
        "expected_revision": managed["project"]["revision"],
        "commands": [{"type": "rename_project", "name": "已编辑目录作品"}],
    }))
    checked("save_managed_project", client.post(f"/api/v2/projects/{folder_id}/save", json={
        "expected_revision": edited["revision"],
    }))
    assert (folder_path.parent / "backups/previous.ludo.json").read_bytes() == old_bytes
    for kind in ("markdown", "csv", "project"):
        exported = checked(f"export_{kind}_to_folder", client.post(f"/api/v2/projects/{folder_id}/export-file", json={
            "expected_revision": edited["revision"], "format": kind,
        }))
        exported_path = Path(exported["path"])
        assert exported_path.is_file() and exported_path.parent == folder_path.parent / "exports"
    checked("folder_collision_refused", client.post("/api/files/new", json={
        "name": folder_name, "folder": str(AREA / "projects"),
        "filename": "other.ludo.json", "layout": "folder",
    }), 409)
    original_copy = copy.read_bytes()
    organized = checked("organize_legacy_project", client.post(f"/api/v2/projects/{identifier}/organize", json={
        "expected_revision": restored["project"]["revision"], "folder": str(AREA / "organized"),
    }))
    assert organized["file"]["managed_folder"] and copy.read_bytes() == original_copy
    assert Path(organized["file"]["path"]).read_bytes() == original_copy
finally:
    client.close()
    process.terminate()
    process.wait(timeout=10)

portable = AREA / f"portable-{time.time_ns()}"
shutil.copytree(folder_path.parent, portable)
process, client = start()
try:
    reopened = checked("portable_folder_after_restart", client.post("/api/files/open", json={
        "path": str(portable / folder_path.name),
    }))
    assert reopened["file"]["managed_folder"] and reopened["project"] == edited
    assert checked("portable_folder_recovery_points", client.get(f"/api/v2/projects/{folder_id}/recovery"))
    restored_folder = checked("portable_folder_restore", client.post(f"/api/v2/projects/{folder_id}/restore", json={
        "expected_revision": edited["revision"], "point_id": "previous",
    }))
    assert restored_folder["project"]["name"] == folder_name
    assert folder_path.read_bytes() != (portable / folder_path.name).read_bytes()
    info = checked("remember_parent_collection", client.get("/api/workspace"))
    assert info["project_folder"] == str(AREA.resolve())
    assert info["ui_language"] == "en"
    REPORT["checks"].append({"name": "english_preference_survives_executable_restart", "passed": True})
    assert not list(portable.rglob("credentials.json"))
    assert not list(portable.rglob("settings.json"))
finally:
    client.close()
    process.terminate()
    process.wait(timeout=10)

output = Path(os.environ.get("NPCS_PACKAGE_REPORT") or os.environ.get("LUDO_PACKAGE_REPORT", str(ROOT / "docs/verification/package-report.json")))
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(
    json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"Passed {len(REPORT['checks'])} packaged executable / real HTTP checks")
