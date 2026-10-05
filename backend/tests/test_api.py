from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app


def test_health_session_and_origin_guard():
    with TestClient(create_app()) as client:
        health = client.get("/api/health").json()
        assert health["storage_mode"] == "local_json"
        assert health["disk_persistence"] is True
        assert client.post("/api/v2/projects", json={"name": "新世界"}).status_code == 401
        assert client.get("/start").status_code == 200
        assert client.post("/api/v2/projects", json={"name": "新世界"}).status_code == 201
        assert (
            client.post(
                "/api/v2/projects", json={}, headers={"Origin": "https://attacker.example"}
            ).status_code
            == 403
        )
        assert (
            client.get("/api/v2/projects", headers={"Sec-Fetch-Site": "cross-site"}).status_code
            == 403
        )


def test_import_validate_export_and_conflict(client, document):
    body = {"document": document}
    assert client.post("/api/v2/projects/validate", json=body).json()["valid"]
    assert not client.get("/api/v2/projects").json()
    imported = client.post("/api/v2/projects/import", json=body)
    assert imported.status_code == 201
    identifier = imported.json()["project_id"]
    assert client.get(f"/api/v2/projects/{identifier}/export").json() == document
    assert client.post("/api/v2/projects/import", json=body).status_code == 409
    changed = client.post(
        f"/api/v2/projects/{identifier}/commands",
        json={"expected_revision": 1, "commands": [{"type": "rename_project", "name": "改名"}]},
    )
    assert changed.status_code == 200
    assert changed.json()["revision"] == 2
    stale = client.post(
        f"/api/v2/projects/{identifier}/commands",
        json={"expected_revision": 1, "commands": [{"type": "rename_project", "name": "冲突"}]},
    )
    assert stale.status_code == 409
    assert stale.json()["current_revision"] == 2
    assert client.get("/api/v2/projects/missing").status_code == 404


def test_legacy_import(client, legacy):
    response = client.post("/api/v2/projects/import", json={"document": legacy})
    assert response.status_code == 201
    assert response.json()["schema_version"] == 2


def test_invalid_requests_do_not_echo_credentials(client, document):
    document["api_key"] = "SECRET-DONT-ECHO"
    response = client.post("/api/v2/projects/import", json={"document": document})
    assert response.status_code == 422
    assert "SECRET-DONT-ECHO" not in response.text
    response = client.post("/api/v2/projects", json={"name": {"api_key": "SECRET-DONT-ECHO"}})
    assert response.status_code == 422
    assert "SECRET-DONT-ECHO" not in response.text


def test_instances_are_isolated(client):
    client.post("/api/v2/projects", json={"name": "临时项目"})
    with TestClient(create_app()) as another:
        another.get("/start")
        assert another.get("/api/v2/projects").json() == []


def test_openapi_schema(client):
    schema = client.get("/api/v2/schema").json()
    assert schema["properties"]["schema_version"]["const"] == 2
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v2/projects/{project_id}/commands" in paths


def test_built_frontend_styles_are_public_and_allowed_by_csp(tmp_path):
    frontend = tmp_path / "frontend"
    (frontend / "assets").mkdir(parents=True)
    (frontend / "index.html").write_text('<link rel="stylesheet" href="/assets/app.css">')
    (frontend / "assets/app.css").write_text("body { background: #211e1b; }")
    with TestClient(create_app(data_dir=tmp_path / "config", frontend_dir=frontend)) as client:
        page = client.get("/")
        assert page.status_code == 200
        directives = {
            parts[0]: parts[1:]
            for directive in page.headers["Content-Security-Policy"].split(";")
            if (parts := directive.split())
        }
        assert "'self'" in directives["style-src"]
        assert "'unsafe-inline'" in directives["style-src"]
        assert "'self'" in directives["default-src"]
        assert "'unsafe-inline'" not in directives["default-src"]
        client.cookies.clear()
        stylesheet = client.get("/assets/app.css")
        assert stylesheet.status_code == 200
        assert stylesheet.headers["content-type"].startswith("text/css")
        assert "#211e1b" in stylesheet.text
        assert client.get("/api/v2/projects").status_code == 401
