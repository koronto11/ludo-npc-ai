"""Multi-profile persistence, purpose defaults and immutable task provenance."""

import json

import pytest
from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app
from ludo_npc.storage import FileProblem, LocalProjects, ModelDefaults, Settings

from .test_generation import FixtureProvider, profile, setup_client, start, wait_job


@pytest.fixture
def store(tmp_path):
    value = LocalProjects(tmp_path / "app", tmp_path / "projects")
    yield value
    value.shutdown()


def second():
    return profile().model_copy(
        update={"id": "second", "name": "对话精修", "model": "other", "max_tokens": 4096}
    )


def test_legacy_configuration_and_empty_defaults():
    old = profile().model_dump(exclude={"enabled", "archived", "last_test"})
    settings = Settings.model_validate({"model_profiles": [old], "active_profile_id": old["id"]})
    assert settings.model_profiles[0].enabled
    assert not settings.model_profiles[0].archived
    assert settings.purpose_defaults == {}
    assert settings.model_profiles[0].last_test is None


def test_independent_profiles_default_assignment_and_restart(store):
    a, b = profile(), second()
    store.set_provider(a)
    store.set_provider(b)
    assert store.settings.active_profile_id == a.id
    store.set_model_defaults(
        ModelDefaults(active_profile_id=a.id, purpose_defaults={"dialogue": b.id, "story": a.id})
    )
    restored = LocalProjects(store.data_dir)
    try:
        assert restored.settings.purpose_defaults == {"dialogue": b.id, "story": a.id}
        assert restored.provider(a.id).max_tokens == 2048
        assert restored.provider(b.id).max_tokens == 4096
        store.set_provider(a.model_copy(update={"enabled": False}))
        assert store.settings.active_profile_id == b.id
        assert store.settings.purpose_defaults == {"dialogue": b.id}
        store.set_provider(a)
        assert store.settings.active_profile_id == b.id
        store.set_provider(a.model_copy(update={"enabled": False}))
        store.set_provider(b.model_copy(update={"enabled": False}))
        assert store.settings.active_profile_id is None
        assert store.settings.purpose_defaults == {}
        assert store.settings.model_profile.endpoint == ""
    finally:
        restored.shutdown()


def test_archive_restore_retains_parameters_and_does_not_reassign_defaults(store):
    a, b = profile(), second()
    store.set_provider(a)
    store.set_provider(b)
    store.set_model_defaults(ModelDefaults(active_profile_id=a.id, purpose_defaults={"text": a.id}))
    store.archive_provider(a.id)
    with pytest.raises(FileProblem, match="停用或移除"):
        store.provider(a.id)
    assert store.settings.active_profile_id == b.id
    assert store.settings.purpose_defaults == {}
    row = store.settings.model_profiles[0]
    assert row.archived and not row.enabled and row.endpoint == a.endpoint
    store.archive_provider(a.id, restore=True)
    assert store.provider(a.id).max_tokens == a.max_tokens
    assert store.settings.active_profile_id == b.id
    assert len(store.settings.model_profiles) == 2


@pytest.mark.parametrize(
    "defaults",
    [
        {"active_profile_id": "unknown"},
        {"active_profile_id": "provider-test", "purpose_defaults": {"dialogue": "second"}},
        {"active_profile_id": None},
    ],
)
def test_invalid_default_is_rejected_without_writes(store, defaults):
    store.set_provider(profile())
    store.set_provider(second().model_copy(update={"enabled": False}))
    old = store.settings_path.read_bytes()
    with pytest.raises(FileProblem):
        store.set_model_defaults(ModelDefaults.model_validate(defaults))
    assert store.settings_path.read_bytes() == old
    assert store.settings.active_profile_id == "provider-test"


def test_write_failure_retains_disk_and_in_memory_defaults(store, monkeypatch):
    store.set_provider(profile())
    before = store.settings.model_dump()
    disk = store.settings_path.read_bytes()

    def fail(*args, **kwargs):
        raise OSError("test-only write failure")

    monkeypatch.setattr("ludo_npc.storage.atomic_bytes", fail)
    with pytest.raises(OSError):
        store.set_provider(profile().model_copy(update={"enabled": False}))
    assert store.settings.model_dump() == before
    assert store.settings_path.read_bytes() == disk


def test_test_results_are_server_owned_and_cannot_attach_to_changed_connection(store):
    a = profile()
    store.set_provider(a)
    store.record_model_test(a, "success", "真实记录")
    recorded = store.provider(a.id).last_test
    store.set_provider(second().model_copy(update={"last_test": recorded}))
    assert store.provider("second").last_test is None
    renamed = a.model_copy(update={"name": "新名称", "last_test": None})
    store.set_provider(renamed)
    assert store.provider(a.id).last_test == recorded
    changed = renamed.model_copy(update={"model": "changed"})
    store.set_provider(changed)
    assert store.provider(a.id).last_test is None
    store.record_model_test(a, "success", "过期测试")
    assert store.provider(a.id).last_test is None
    store.archive_provider(a.id)
    store.record_model_test(changed, "success", "已移除的测试")
    assert store.settings.model_profiles[0].last_test is None


def test_test_api_persists_only_safe_status_not_response_or_key(tmp_path):
    provider = FixtureProvider()
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        response = client.post(
            "/api/models/test",
            json={"profile": profile().model_dump(mode="json"), "api_key": "test-session-secret"},
        )
        assert response.status_code == 200
        info = client.get("/api/workspace").json()
        result = info["model_profiles"][0]["last_test"]
        assert result["status"] == "success" and result["checked_at"]
        assert "test-session-secret" not in json.dumps(info)
        assert "test-session-secret" not in (tmp_path / "app/settings.json").read_text(
            encoding="utf-8"
        )
    finally:
        client.__exit__(None, None, None)


def test_disabled_submission_does_not_call_provider_or_create_history(tmp_path):
    provider = FixtureProvider()
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        client.put(
            "/api/workspace/model-profiles", json=profile(enabled=False).model_dump(mode="json")
        )
        response = start(client, identifier, [{"name": "不能生成"}])
        assert response.status_code == 422
        assert provider.calls == []
        assert client.get(f"/api/v2/projects/{identifier}/generation").json() == []
    finally:
        client.__exit__(None, None, None)


def test_running_and_historical_task_keep_original_model_after_config_changes(tmp_path):
    class CapturingProvider(FixtureProvider):
        async def complete(self, selected, key, messages, progress=None, probe=False):
            self.selected = selected.model_copy(deep=True)
            return await super().complete(selected, key, messages, progress, probe)

    provider = CapturingProvider(delay=0.1)
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        assert start(client, identifier, [{"name": "历史角色"}], purpose="story").status_code == 202
        altered = profile().model_copy(
            update={"name": "改名", "model": "changed", "endpoint": "http://127.0.0.1:4191/v1"}
        )
        assert (
            client.put(
                "/api/workspace/model-profiles", json=altered.model_dump(mode="json")
            ).status_code
            == 200
        )
        assert client.delete("/api/workspace/model-profiles/provider-test").status_code == 200
        job = wait_job(client, identifier)
        assert job["status"] == "awaiting_review"
        assert job["profile_name"] == "测试适配器"
        assert job["model"] == "fixture" and job["model_endpoint"] == profile().endpoint
        assert job["purpose"] == "story"
        assert provider.selected.model == "fixture"
    finally:
        client.__exit__(None, None, None)
    with TestClient(
        create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects")
    ) as reopened:
        reopened.get("/api/session")
        result = reopened.post(
            "/api/files/open", json={"path": str(tmp_path / "projects/test.ludo.json")}
        )
        record = result.json()["project"]["content"]["generation_history"][0]
        assert record["profile_name"] == "测试适配器" and record["model"] == "fixture"
        assert record["purpose"] == "story"
        assert (
            reopened.post("/api/workspace/model-profiles/provider-test/restore").status_code == 200
        )


def test_failure_probe_records_sanitized_status_without_provider_body(tmp_path):
    import httpx2 as httpx

    from ludo_npc.providers import ChatProvider

    async def denied(request):
        return httpx.Response(401, json={"error": "test-session-secret"})

    with TestClient(
        create_app(
            data_dir=tmp_path / "app",
            project_dir=tmp_path / "projects",
            provider=ChatProvider(httpx.MockTransport(denied)),
        )
    ) as client:
        client.get("/api/session")
        client.put("/api/workspace/model-profiles", json=profile().model_dump(mode="json"))
        result = client.post(
            "/api/models/test",
            json={"profile": profile().model_dump(mode="json"), "api_key": "test-session-secret"},
        )
        assert result.status_code == 502
        stored = client.get("/api/workspace").json()["model_profiles"][0]["last_test"]
        assert stored["status"] == "failed"
        assert "test-session-secret" not in json.dumps(stored)
