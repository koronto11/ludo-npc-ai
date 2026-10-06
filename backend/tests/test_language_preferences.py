import json

from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app


def test_language_is_local_application_preference_and_survives_restart(tmp_path):
    area = tmp_path / "app"
    projects = tmp_path / "projects"
    with TestClient(create_app(data_dir=area, project_dir=projects)) as client:
        client.get("/start")
        assert client.get("/api/workspace").json()["ui_language"] == "zh"
        made = client.post("/api/v2/projects", json={"name": "草稿审核"}).json()
        identifier = made["project_id"]
        before_project = client.get(f"/api/v2/projects/{identifier}").json()
        before_settings = client.get("/api/workspace").json()
        result = client.put("/api/workspace/preferences", json={"ui_language": "en"})
        assert result.json() == {"ui_language": "en"}
        after_settings = client.get("/api/workspace").json()
        assert {k: v for k, v in before_settings.items() if k != "ui_language"} == {
            k: v for k, v in after_settings.items() if k != "ui_language"
        }
        assert client.get(f"/api/v2/projects/{identifier}").json() == before_project
        assert json.loads((area / "settings.json").read_text(encoding="utf8"))["ui_language"] == "en"
    with TestClient(create_app(data_dir=area, project_dir=projects)) as client:
        client.get("/start")
        assert client.get("/api/workspace").json()["ui_language"] == "en"


def test_preferences_reject_unsupported_values_and_extra_fields(client):
    before = client.get("/api/workspace").json()
    for body in ({"ui_language": "fr"}, {"ui_language": "en", "project_folder": "other"}, {}):
        assert client.put("/api/workspace/preferences", json=body).status_code == 422
        assert client.get("/api/workspace").json() == before


def test_preferences_require_local_session_and_same_origin(tmp_path):
    with TestClient(create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects")) as client:
        assert client.put("/api/workspace/preferences", json={"ui_language": "en"}).status_code == 401
        client.get("/start")
        for headers in ({"Origin": "https://attacker.example"}, {"Sec-Fetch-Site": "cross-site"}):
            assert client.put("/api/workspace/preferences", json={"ui_language": "en"}, headers=headers).status_code == 403
        assert client.get("/api/workspace").json()["ui_language"] == "zh"


def test_failed_preference_write_keeps_in_memory_settings(client, monkeypatch):
    import ludo_npc.storage as storage

    def fail(*args, **kwargs):
        raise OSError("test disk failure")

    before = client.get("/api/workspace").json()
    monkeypatch.setattr(storage, "atomic_bytes", fail)
    assert client.put("/api/workspace/preferences", json={"ui_language": "en"}).status_code == 503
    assert client.get("/api/workspace").json() == before
