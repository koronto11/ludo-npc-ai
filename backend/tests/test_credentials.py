"""Real Windows encryption, request reuse, isolation and failure preservation."""

import json
import os

import pytest
from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app
from ludo_npc.credentials import Credentials
from ludo_npc.storage import FileProblem, LocalProjects

from .test_generation import FixtureProvider, profile, setup_client, start, wait_job

windows = pytest.mark.skipif(os.name != "nt", reason="actual user-scoped Windows DPAPI")
SECRET = "fixture-only-secret-never-a-real-key"


class CapturingProvider(FixtureProvider):
    def __init__(self):
        super().__init__()
        self.keys = []

    async def complete(self, selected, key, messages, progress=None, probe=False):
        self.keys.append(key)
        return await super().complete(selected, key, messages, progress, probe)


@windows
def test_restart_profile_isolation_archive_restore_and_clear(tmp_path):
    store = LocalProjects(tmp_path)
    a = profile()
    b = a.model_copy(update={"id": "second", "name": "second"})
    store.set_provider(a)
    store.set_provider(b)
    store.credentials.set(a, SECRET)
    store.credentials.set(b, "second-fixture-key")
    reopened = LocalProjects(tmp_path)
    assert reopened.provider_key(a) == SECRET
    assert reopened.provider_key(b) == "second-fixture-key"
    assert SECRET not in reopened.credentials.path.read_text()
    assert SECRET not in json.dumps(reopened.workspace())
    assert SECRET not in reopened.settings_path.read_text(encoding="utf-8")
    reopened.archive_provider(a.id)
    assert not reopened.workspace()["credentials"]["saved"][a.id]
    reopened.archive_provider(a.id, restore=True)
    assert reopened.provider_key(reopened.provider(a.id)) == SECRET
    reopened.credentials.clear(a.id)
    assert not LocalProjects(tmp_path).provider_key(a)
    assert reopened.provider_key(b) == "second-fixture-key"


@windows
def test_saved_key_cannot_follow_changed_destination_and_copy(tmp_path):
    store = LocalProjects(tmp_path)
    a = profile()
    store.set_provider(a)
    store.credentials.set(a, SECRET)
    for patch in [{"endpoint": "http://localhost:9999/v1"}, {"mode": "remote"}, {"id": "copy"}]:
        assert not store.provider_key(a.model_copy(update=patch))
    changed = a.model_copy(update={"model": "another-model", "name": "renamed"})
    assert store.provider_key(changed) == SECRET
    assert store.provider_key(a, "explicit-session-key") == "explicit-session-key"


@windows
def test_write_failure_tamper_and_unreadable_file_preserve_original(tmp_path, monkeypatch):
    store = LocalProjects(tmp_path)
    a = profile()
    store.set_provider(a)
    store.credentials.set(a, SECRET)
    original = store.credentials.path.read_bytes()

    def fail(*args, **kwargs):
        raise OSError("fixture-write-failure")

    with monkeypatch.context() as scope:
        scope.setattr("ludo_npc.credentials.atomic_bytes", fail)
        with pytest.raises(FileProblem, match="保存失败"):
            store.credentials.set(a, "replacement-fixture-key")
    assert store.credentials.path.read_bytes() == original
    assert store.provider_key(a) == SECRET
    doc = json.loads(original)
    doc["items"][a.id]["ciphertext"] = "not valid base64"
    store.credentials.path.write_text(json.dumps(doc))
    info = store.workspace()["credentials"]
    assert not info["saved"][a.id] and info["warning"]
    with pytest.raises(FileProblem, match="无法"):
        store.provider_key(a)
    store.credentials.clear(a.id)
    assert not store.provider_key(a)
    store.credentials.path.write_text("{broken")
    with pytest.raises(FileProblem, match="原文件已保留"):
        store.credentials.set(a, SECRET)
    assert store.credentials.path.read_text() == "{broken"
    assert store.workspace()["credentials"]["warning"]


@windows
def test_http_restart_test_and_generation_reuse_without_secret_exports(tmp_path):
    client, identifier, app = setup_client(tmp_path, CapturingProvider())
    selected = profile().model_copy(update={"mode": "remote"})
    try:
        client.put("/api/workspace/model-profiles", json=selected.model_dump(mode="json"))
        response = client.put(
            "/api/workspace/model-profiles/provider-test/credential",
            json={"api_key": SECRET, "endpoint": selected.endpoint},
        )
        assert response.status_code == 200 and SECRET not in response.text
        assert response.json()["credentials"]["saved"][selected.id]
        refused = client.put(
            "/api/workspace/model-profiles/provider-test/credential",
            json={"api_key": SECRET, "endpoint": "http://localhost:9999"},
        )
        assert refused.status_code == 422 and SECRET not in refused.text
    finally:
        client.__exit__(None, None, None)
    adapter = CapturingProvider()
    with TestClient(
        create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects", provider=adapter)
    ) as reopened:
        reopened.get("/api/session")
        assert reopened.post(
            "/api/files/open", json={"path": str(tmp_path / "projects/test.ludo.json")}
        ).status_code == 200
        assert reopened.post(
            "/api/models/test", json={"profile": selected.model_dump(mode="json")}
        ).status_code == 200
        assert start(reopened, identifier, [{"name": "重启后的角色"}], api_key="").status_code == 202
        assert wait_job(reopened, identifier)["status"] == "awaiting_review"
        assert adapter.keys == [SECRET, SECRET]
        for endpoint in ["/api/workspace", f"/api/v2/projects/{identifier}", "/api/openapi.json"]:
            assert SECRET not in reopened.get(endpoint).text
        for path in tmp_path.rglob("*.json"):
            assert SECRET not in path.read_text(encoding="utf-8")
        copied = selected.model_copy(update={"id": "copy"})
        assert reopened.post(
            "/api/models/test", json={"profile": copied.model_dump(mode="json")}
        ).status_code == 422
        changed = selected.model_copy(update={"endpoint": "http://localhost:9999/v1"})
        assert reopened.post(
            "/api/models/test", json={"profile": changed.model_dump(mode="json")}
        ).status_code == 422
        assert adapter.keys == [SECRET, SECRET]
        assert reopened.delete(
            "/api/workspace/model-profiles/provider-test/credential"
        ).status_code == 200
        assert reopened.post(
            "/api/models/test", json={"profile": selected.model_dump(mode="json")}
        ).status_code == 422
        assert adapter.keys == [SECRET, SECRET]


def test_unsupported_platform_never_falls_back_to_plaintext(tmp_path, monkeypatch):
    monkeypatch.setattr("ludo_npc.credentials.os.name", "posix")
    credentials = Credentials(tmp_path)
    assert not credentials.supported
    with pytest.raises(FileProblem, match="仅本次会话"):
        credentials.set(profile(), SECRET)
    assert not credentials.path.exists()
