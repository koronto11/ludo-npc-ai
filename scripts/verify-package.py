"""Run the packaged executable twice and exercise real local-file APIs."""

import json
import subprocess
import time
from pathlib import Path

import httpx2 as httpx

ROOT = Path(__file__).resolve().parents[1]
AREA = ROOT / ".local-build" / "package-verification"
AREA.mkdir(parents=True, exist_ok=True)
REPORT = {"transport": "real_http_packaged_executable", "checks": []}
COMMAND = [
    str(ROOT / "release/LudoNPC/LudoNPC.exe"),
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
finally:
    client.close()
    process.terminate()
    process.wait(timeout=10)

output = ROOT / "docs/verification/batch-2-package.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(
    json.dumps(REPORT, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"Passed {len(REPORT['checks'])} packaged executable / real HTTP checks")
