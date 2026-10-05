import asyncio
import json
import time

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app
from ludo_npc.application.commands import CommandBatch, CommandError, apply_commands
from ludo_npc.domain.models import Draft
from ludo_npc.drafts import ReviewError, author_hash, review
from ludo_npc.providers import ChatProvider, ProviderError
from ludo_npc.samples import outpost_project
from ludo_npc.storage import ProviderProfile


def profile(**extra):
    return ProviderProfile(
        id="provider-test",
        name="测试适配器",
        endpoint="http://127.0.0.1:4190/v1",
        model="fixture",
        mode="local",
        **extra,
    )


def edit(project, commands):
    return apply_commands(
        project,
        CommandBatch.model_validate({"expected_revision": project.revision, "commands": commands}),
    )


def draft(project, **kwargs):
    values = dict(
        id="draft-test",
        name="角色候选",
        target={"kind": "character", "id": "keeper"},
        patch={"role": "候选新身份", "story": "候选故事"},
        basis_hash=author_hash(project),
        base_content_revision=project.content_revision,
        base_values={
            "role": project.content.characters[0].role,
            "story": project.content.characters[0].story,
        },
    )
    values.update(kwargs)
    return Draft.model_validate(values)


def add_draft(project, value):
    return edit(project, [{"type": "put_draft", "draft": value.model_dump(mode="json")}])


def accept(project, identifier="draft-test", values=None):
    return edit(
        project,
        [
            {
                "type": "review_draft",
                "draft_id": identifier,
                "action": "accept",
                "expected_author_hash": author_hash(project),
                "values": values or {"story": "审核后的故事"},
            }
        ],
    )


def test_review_protects_confirmed_fields_and_accepts_only_selected():
    p = outpost_project()
    p.content.characters[0].confirmed_fields = ["role"]
    p = add_draft(p, draft(p))
    r = review(p, "draft-test")
    assert next(f for f in r["fields"] if f["field"] == "role")["protected"]
    with pytest.raises(ReviewError, match="确认字段"):
        accept(p, values={"role": "篡改身份", "story": "变化"})
    accepted = accept(p)
    assert accepted.content.characters[0].role == p.content.characters[0].role
    assert accepted.content.characters[0].story == "审核后的故事"
    assert next(d for d in accepted.content.drafts if d.id == "draft-test").applied_fields == [
        "story"
    ]


def test_candidate_edits_cannot_resurrect_history_or_change_review_basis():
    p = outpost_project()
    candidate = draft(p)
    p = add_draft(p, candidate)
    for field, value in [
        ("basis_hash", "forged"),
        ("operation", "create"),
        ("target", {"kind": "character", "id": "new-target"}),
    ]:
        changed = candidate.model_dump(mode="json")
        changed[field] = value
        with pytest.raises(CommandError, match="审核目标或基准"):
            edit(p, [{"type": "put_draft", "draft": changed}])
    p = accept(p)
    with pytest.raises(CommandError, match="已审核草稿"):
        add_draft(p, candidate)
    assert p.content.characters[0].story == "审核后的故事"


def test_stale_draft_requires_explicit_comparison_even_for_different_field():
    p = outpost_project()
    p = add_draft(p, draft(p))
    p = edit(
        p,
        [
            {
                "type": "patch_entity",
                "target": {"kind": "character", "id": "keeper"},
                "changes": {"goals": ["新的人工目标"]},
            }
        ],
    )
    assert review(p, "draft-test")["stale"]
    with pytest.raises(ReviewError, match="过期"):
        accept(p)
    p = edit(
        p,
        [
            {
                "type": "rebase_draft",
                "draft_id": "draft-test",
                "expected_author_hash": author_hash(p),
            }
        ],
    )
    assert not review(p, "draft-test")["stale"]
    assert accept(p).content.characters[0].goals == ["新的人工目标"]


def test_field_conflict_preserves_base_and_shows_current():
    p = outpost_project()
    p = add_draft(p, draft(p))
    old = p.content.characters[0].story
    p = edit(
        p,
        [
            {
                "type": "patch_entity",
                "target": {"kind": "character", "id": "keeper"},
                "changes": {"story": "人工后来写的故事"},
            }
        ],
    )
    f = next(f for f in review(p, "draft-test")["fields"] if f["field"] == "story")
    assert f["conflict"] and f["base"] == old and f["current"] == "人工后来写的故事"
    with pytest.raises(ReviewError):
        accept(p)
    assert p.content.characters[0].story == "人工后来写的故事"


def test_metadata_and_layout_do_not_make_draft_stale():
    p = outpost_project()
    p = add_draft(p, draft(p))
    p = edit(
        p,
        [
            {
                "type": "put_generation_record",
                "record": {
                    "id": "record-other",
                    "name": "另一任务",
                    "status": "failed",
                    "mode": "local",
                },
            }
        ],
    )
    board = p.editor.canvases[0]
    p = edit(
        p,
        [
            {
                "type": "move_node",
                "canvas_id": board.id,
                "target": {"kind": "character", "id": "keeper"},
                "position": {"x": 333, "y": 444},
            }
        ],
    )
    assert not review(p, "draft-test")["stale"]
    assert accept(p).content.characters[0].story == "审核后的故事"


def test_new_character_is_not_formal_until_review_and_bulk_is_atomic():
    p = outpost_project()
    count = len(p.content.characters)
    values = [
        Draft(
            id=f"draft-{i}",
            name=f"新角色{i}",
            target={"kind": "character", "id": f"new-{i}"},
            operation="create",
            patch={"name": f"新角色{i}", "story": "候选"},
            basis_hash=author_hash(p),
            base_content_revision=p.content_revision,
        )
        for i in range(2)
    ]
    p = edit(p, [{"type": "put_draft", "draft": v.model_dump(mode="json")} for v in values])
    assert len(p.content.characters) == count
    commands = [
        {
            "type": "review_draft",
            "draft_id": v.id,
            "action": "accept",
            "expected_author_hash": author_hash(p),
            "values": v.patch,
        }
        for v in values
    ]
    accepted = edit(p, commands)
    assert len(accepted.content.characters) == count + 2
    assert len(accepted.editor.canvases[0].nodes) == len(p.editor.canvases[0].nodes) + 2
    commands[1]["values"] = {"name": ""}
    with pytest.raises(ValueError):
        edit(p, commands)
    assert len(p.content.characters) == count and all(
        d.status == "pending" for d in p.content.drafts
    )


def test_reject_does_not_touch_author_and_cannot_accept_twice():
    p = outpost_project()
    p = add_draft(p, draft(p))
    old = p.content.characters[0].model_dump()
    p = edit(p, [{"type": "review_draft", "draft_id": "draft-test", "action": "reject"}])
    assert p.content.characters[0].model_dump() == old
    with pytest.raises(ReviewError):
        accept(p)


def test_review_hash_detects_edit_during_review():
    p = outpost_project()
    p = add_draft(p, draft(p))
    basis = author_hash(p)
    p = edit(
        p, [{"type": "replace_world", "world": p.content.world.model_dump() | {"tone": "新风格"}}]
    )
    with pytest.raises(ReviewError, match="期间"):
        edit(p, [{"type": "rebase_draft", "draft_id": "draft-test", "expected_author_hash": basis}])


class FixtureProvider:
    def __init__(self, delay=0):
        self.delay = delay
        self.calls = []
        self.active = 0
        self.peak = 0

    async def complete(self, profile, key, messages, progress=None, probe=False):
        if probe:
            return "OK", {"total_tokens": 4}
        request = json.loads(messages[-1]["content"])
        self.calls.append(request)
        self.active += 1
        self.peak = max(self.peak, self.active)
        try:
            await asyncio.sleep(self.delay)
            if "失败" in request["name"]:
                return "invalid-json", {"total_tokens": 5}
            if request["kind"] == "character":
                patch = {
                    "name": request["name"],
                    "role": "生成身份",
                    "story": "生成的故事",
                    "goals": ["守护驿站"],
                }
            elif request["kind"] == "dialogue":
                actor = request["context"]["actor"]
                patch = {
                    "name": request["name"],
                    "character_id": actor["id"] if actor else None,
                    "entry_node_id": "start",
                    "nodes": [
                        {
                            "id": "start",
                            "text": "你好",
                            "speaker_id": actor["id"] if actor else None,
                            "options": [
                                {"id": "leave-generated", "text": "再见", "target_node_id": None}
                            ],
                        }
                    ],
                }
            else:
                patch = {"name": request["name"], "body": "生成的信件", "text_type": "letter"}
            if request["fields"]:
                patch = {k: v for k, v in patch.items() if k in request["fields"]}
            return json.dumps({"patch": patch}, ensure_ascii=False), {"total_tokens": 10}
        finally:
            self.active -= 1


def setup_client(tmp_path, provider):
    app = create_app(
        data_dir=tmp_path / "app", project_dir=tmp_path / "projects", provider=provider
    )
    client = TestClient(app)
    client.__enter__()
    client.get("/api/session")
    created = client.post(
        "/api/files/new",
        json={
            "name": "生成验证",
            "folder": str(tmp_path / "projects"),
            "filename": "test.ludo.json",
            "template": "outpost",
        },
    ).json()
    client.put("/api/workspace/model-profiles", json=profile().model_dump(mode="json"))
    return client, created["project"]["project_id"], app


def start(client, identifier, items, **extra):
    p = client.get(f"/api/v2/projects/{identifier}").json()
    return client.post(
        f"/api/v2/projects/{identifier}/generate",
        json={
            "request_id": "generation-test",
            "expected_revision": p["revision"],
            "profile_id": "provider-test",
            "api_key": "test-session-secret",
            "instructions": "遵守世界规则",
            "items": items,
            **extra,
        },
    )


def wait_job(client, identifier):
    for _ in range(300):
        jobs = client.get(f"/api/v2/projects/{identifier}/generation").json()
        if jobs and all(j["status"] not in {"queued", "running"} for j in jobs):
            return jobs[-1]
        time.sleep(0.01)
    raise AssertionError("generation did not finish")


def test_api_generation_saves_pending_without_changing_author_or_credentials(tmp_path):
    provider = FixtureProvider()
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        response = start(client, identifier, [{"kind": "character", "name": "新守门人"}])
        assert response.status_code == 202
        job = wait_job(client, identifier)
        p = client.get(f"/api/v2/projects/{identifier}").json()
        assert job["status"] == "awaiting_review" and job["usage"]["total_tokens"] == 10
        assert (
            len(p["content"]["characters"]) == 1
            and len([d for d in p["content"]["drafts"] if d["task_id"] == "generation-test"]) == 1
        )
        for path in tmp_path.rglob("*.json"):
            assert "test-session-secret" not in path.read_text(encoding="utf-8")
        assert "test-session-secret" not in json.dumps(job)
        assert provider.calls[0]["context"]["world"]["name"] == "赤沙边境"
    finally:
        client.__exit__(None, None, None)


def test_generation_scenario_contains_only_current_actor_knowledge(tmp_path):
    provider = FixtureProvider()
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        assert (
            start(
                client,
                identifier,
                [{"kind": "dialogue", "name": "生成对话", "character_id": "keeper"}],
                scenario={"expected_content_revision": 1, "at_tick": 2},
            ).status_code
            == 202
        )
        wait_job(client, identifier)
        assert provider.calls[0]["context"]["known_facts"] == []
        assert provider.calls[0]["context"]["actor_state"]["known_fact_ids"] == []
        p = client.get(f"/api/v2/projects/{identifier}").json()
        assert (
            next(d for d in p["content"]["drafts"] if d["task_id"] == "generation-test")["patch"][
                "nodes"
            ][0]["options"][0]["target_node_id"]
            is None
        )
    finally:
        client.__exit__(None, None, None)


def test_incomplete_rehearsal_does_not_send_partial_context_to_provider(tmp_path):
    provider = FixtureProvider()
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        project = client.get(f"/api/v2/projects/{identifier}").json()
        created = client.post(
            f"/api/v2/projects/{identifier}/commands",
            json={
                "expected_revision": project["revision"],
                "commands": [
                    {
                        "type": "create_entity",
                        "entity": {
                            "kind": "rule",
                            "id": "extra-rule",
                            "name": "额外起点规则",
                            "condition": {"op": "always"},
                            "effects": [
                                {"op": "increment_variable", "variable_id": "supplies", "amount": 1}
                            ],
                        },
                    }
                ],
            },
        )
        assert created.status_code == 200
        response = start(
            client,
            identifier,
            [{"name": "角色"}],
            scenario={"expected_content_revision": 1, "at_tick": 3, "max_steps": 1},
        )
        assert response.status_code == 422
        assert "预演未完整执行" in response.json()["message"]
        assert provider.calls == []
    finally:
        client.__exit__(None, None, None)


def test_generation_during_manual_edit_becomes_stale_and_preserves_edit(tmp_path):
    provider = FixtureProvider(delay=0.15)
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        assert (
            start(
                client,
                identifier,
                [{"kind": "character", "name": "夏岚", "target_id": "keeper", "fields": ["story"]}],
            ).status_code
            == 202
        )
        p = client.get(f"/api/v2/projects/{identifier}").json()
        assert (
            client.post(
                f"/api/v2/projects/{identifier}/commands",
                json={
                    "expected_revision": p["revision"],
                    "commands": [
                        {
                            "type": "patch_entity",
                            "target": {"kind": "character", "id": "keeper"},
                            "changes": {"story": "人工作品"},
                        }
                    ],
                },
            ).status_code
            == 200
        )
        wait_job(client, identifier)
        p = client.get(f"/api/v2/projects/{identifier}").json()
        d = next(d for d in p["content"]["drafts"] if d["task_id"] == "generation-test")
        r = client.get(f"/api/v2/projects/{identifier}/drafts/{d['id']}/review").json()
        assert r["stale"] and r["fields"][0]["conflict"]
        assert p["content"]["characters"][0]["story"] == "人工作品"
    finally:
        client.__exit__(None, None, None)


def test_batch_partial_failure_and_explicit_retry_only_failed_item(tmp_path):
    provider = FixtureProvider()
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        assert (
            start(client, identifier, [{"name": "成功角色"}, {"name": "失败角色"}]).status_code
            == 202
        )
        job = wait_job(client, identifier)
        assert (
            len(job["draft_ids"]) == 1
            and len(job["failures"]) == 1
            and job["usage"]["total_tokens"] == 15
        )
        failed = next(i for i in job["items"] if i["status"] == "failed")
        assert (
            start(
                client,
                identifier,
                [{k: failed[k] for k in ["kind", "name", "target_id", "character_id", "fields"]}],
                request_id="retry-only",
            ).status_code
            == 202
        )
        wait_job(client, identifier)
        assert [c["name"] for c in provider.calls].count("成功角色") == 1
        assert [c["name"] for c in provider.calls].count("失败角色") == 2
    finally:
        client.__exit__(None, None, None)


def test_generation_has_global_two_request_concurrency_and_can_cancel(tmp_path):
    provider = FixtureProvider(delay=0.2)
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        assert (
            start(client, identifier, [{"name": f"角色{i}"} for i in range(10)]).status_code == 202
        )
        time.sleep(0.03)
        assert (
            client.post(
                f"/api/v2/projects/{identifier}/generation/generation-test/cancel"
            ).status_code
            == 200
        )
        job = wait_job(client, identifier)
        assert job["status"] == "cancelled" and provider.peak <= 2 and len(provider.calls) <= 2
        p = client.get(f"/api/v2/projects/{identifier}").json()
        assert not [d for d in p["content"]["drafts"] if d["task_id"] == "generation-test"]
    finally:
        client.__exit__(None, None, None)


def test_task_id_is_idempotent_and_file_close_blocked_during_generation(tmp_path):
    provider = FixtureProvider(delay=0.1)
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        assert start(client, identifier, [{"name": "角色"}]).status_code == 202
        assert start(client, identifier, [{"name": "角色"}]).status_code == 202
        assert (
            client.post(f"/api/v2/projects/{identifier}/close", json={"discard": True}).status_code
            != 200
        )
        wait_job(client, identifier)
        assert len(provider.calls) == 1
    finally:
        client.__exit__(None, None, None)


def test_shutdown_persists_interrupted_and_reopen_does_not_call_model(tmp_path):
    provider = FixtureProvider(delay=10)
    client, identifier, app = setup_client(tmp_path, provider)
    assert start(client, identifier, [{"name": "角色"}]).status_code == 202
    client.__exit__(None, None, None)
    second = FixtureProvider()
    with TestClient(
        create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects", provider=second)
    ) as client:
        client.get("/api/session")
        result = client.post(
            "/api/files/open", json={"path": str(tmp_path / "projects/test.ludo.json")}
        ).json()
        assert result["project"]["content"]["generation_history"][0]["status"] == "interrupted"
        assert second.calls == []


def test_failed_item_details_survive_restart_for_explicit_retry(tmp_path):
    provider = FixtureProvider()
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        assert start(client, identifier, [{"name": "失败角色"}]).status_code == 202
        job = wait_job(client, identifier)
        assert job["items"][0]["status"] == "failed"
    finally:
        client.__exit__(None, None, None)
    second = FixtureProvider()
    with TestClient(
        create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects", provider=second)
    ) as client:
        client.get("/api/session")
        assert (
            client.post(
                "/api/files/open", json={"path": str(tmp_path / "projects/test.ludo.json")}
            ).status_code
            == 200
        )
        recovered = client.get(f"/api/v2/projects/{identifier}/generation").json()[0]
        assert recovered["items"] == job["items"]
        assert recovered["items"][0]["name"] == "失败角色"
        assert second.calls == []


def test_unsafe_profile_and_request_errors_never_echo_key(tmp_path):
    with TestClient(
        create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects")
    ) as client:
        client.get("/api/session")
        response = client.post(
            "/api/models/test",
            json={
                "profile": profile().model_dump(mode="json")
                | {"endpoint": "https://user:test-session-secret@example.com/v1"},
                "api_key": "test-session-secret",
            },
        )
        assert response.status_code == 422 and "test-session-secret" not in response.text
        assert (
            client.put(
                "/api/workspace/model-profiles",
                json=profile().model_dump(mode="json") | {"api_key": "test-session-secret"},
            ).status_code
            == 422
        )


def test_provider_stream_json_and_usage_and_redaction():
    payload = '{"patch":{"story":"test-session-secret故事"}}'
    chunks = [
        json.dumps({"choices": [{"delta": {"content": piece}}]})
        for piece in [payload[:10], payload[10:]]
    ]
    chunks.append(
        json.dumps(
            {"choices": [{"delta": {}, "finish_reason": "stop"}], "usage": {"total_tokens": 12}}
        )
    )

    async def handler(request):
        assert request.headers["authorization"] == "Bearer test-session-secret"
        assert json.loads(request.content)["response_format"] == {"type": "json_object"}
        return httpx.Response(
            200,
            content="\n\n".join("data: " + c for c in chunks) + "\n\ndata: [DONE]\n\n",
            headers={"content-type": "text/event-stream"},
        )

    adapter = ChatProvider(httpx.MockTransport(handler))
    text, usage = asyncio.run(
        adapter.complete(
            profile(stream=True, json_mode=True),
            "test-session-secret",
            [{"role": "user", "content": "创作"}],
        )
    )
    assert "test-session-secret" not in text and usage == {"total_tokens": 12}
    assert json.loads(text)["patch"]["story"] == "[密钥已移除]故事"


@pytest.mark.parametrize("code", [401, 429, 503])
def test_provider_error_does_not_expose_service_body(code):
    async def handler(request):
        return httpx.Response(code, json={"error": "test-session-secret"})

    with pytest.raises(ProviderError) as exc:
        asyncio.run(
            ChatProvider(httpx.MockTransport(handler)).complete(
                profile(), "test-session-secret", []
            )
        )
    assert "test-session-secret" not in str(exc.value)


@pytest.mark.parametrize(
    "body", [[], {"choices": "test-session-secret"}, {"choices": [{"message": []}]}]
)
def test_malformed_success_response_becomes_safe_protocol_error(body):
    async def handler(request):
        return httpx.Response(200, json=body)

    with pytest.raises(ProviderError) as exc:
        asyncio.run(ChatProvider(httpx.MockTransport(handler)).complete(profile(), "", []))
    assert exc.value.code == "protocol"
    assert "test-session-secret" not in str(exc.value)


def test_provider_unsupported_usage_is_not_invented():
    async def handler(request):
        return httpx.Response(
            200, json={"choices": [{"message": {"content": "OK"}}], "usage": [123]}
        )

    text, usage = asyncio.run(
        ChatProvider(httpx.MockTransport(handler)).complete(profile(), "", [])
    )
    assert text == "OK" and usage == {}


def test_provider_incomplete_or_truncated_stream_is_not_a_draft():
    async def handler(request):
        return httpx.Response(200, content='data: {"choices":[{"delta":{"content":"half"}}]}\n\n')

    with pytest.raises(ProviderError, match="完整结束"):
        asyncio.run(
            ChatProvider(httpx.MockTransport(handler)).complete(profile(stream=True), "", [])
        )


def test_provider_finite_retry_only_transient_and_cancel_interrupts_backoff():
    calls = []

    async def handler(request):
        calls.append(1)
        return httpx.Response(503, json={})

    async def run():
        task = asyncio.create_task(
            ChatProvider(httpx.MockTransport(handler)).complete(profile(retry_limit=2), "", [])
        )
        await asyncio.sleep(0.02)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())
    assert len(calls) == 1
