import json

import pytest

from tests.test_generation import FixtureProvider, setup_client, start, wait_job
from tests.test_scene_crowd_workflow import item, setup_scene


class LimitsProvider:
    def __init__(self, *, extra_cards=False, text=None):
        self.calls = []
        self.extra_cards, self.text = extra_cards, text

    async def complete(self, profile, key, messages, progress=None):
        request = json.loads(messages[-1]["content"])
        self.calls.append((profile.max_tokens, request))
        limits = request["output_limits"]
        if request["kind"] == "dialogue":
            count = limits["card_count"] + (
                2 if self.extra_cards and request["name"] == "超量" else 0
            )
            nodes = [
                {
                    "id": f"node-{i}",
                    "text": self.text or "篝火暖和，坐下歇歇。",
                    "options": [
                        {
                            "id": f"option-{i}",
                            "text": "继续",
                            "target_node_id": f"node-{i + 1}" if i + 1 < count else None,
                        }
                    ],
                }
                for i in range(count)
            ]
            patch = {"name": request["name"], "entry_node_id": "node-0", "nodes": nodes}
        else:
            patch = {"name": request["name"], "body": self.text or "夜色笼罩驿站。"}
        return json.dumps({"patch": patch}, ensure_ascii=False), {"total_tokens": 37}


def limited_item(*, count=2, length="short", kind="dialogue", name="合规"):
    return {
        **item(kind, name),
        "output_limits": {
            "card_count": count if kind == "dialogue" else None,
            "text_length": length,
        },
    }


@pytest.mark.parametrize(
    "count,length,chars", [(1, "short", 120), (2, "medium", 240), (6, "long", 480)]
)
def test_exact_cards_length_prompt_budget_and_reopened_provenance(tmp_path, count, length, chars):
    provider = LimitsProvider(text="字" * chars)
    client, identifier, app = setup_client(tmp_path, provider)
    try:
        setup_scene(client, identifier)
        profile_before = app.state.projects.provider("provider-test").model_dump()
        assert (
            start(client, identifier, [limited_item(count=count, length=length)]).status_code == 202
        )
        job = wait_job(client, identifier)
        assert job["status"] == "awaiting_review" and len(provider.calls) == 1
        cap, request = provider.calls[0]
        assert cap <= profile_before["max_tokens"]
        if count == 1 and length == "short":
            assert cap < profile_before["max_tokens"]
        assert request["output_limits"]["max_output_tokens"] == cap
        assert request["output_limits"]["max_text_chars"] == chars
        assert request["entity_schema"]["properties"]["nodes"]["minItems"] == count
        assert request["entity_schema"]["properties"]["nodes"]["maxItems"] == count
        assert app.state.projects.provider("provider-test").model_dump() == profile_before
        project = client.get(f"/api/v2/projects/{identifier}").json()
        draft = next(d for d in project["content"]["drafts"] if d["id"] == job["draft_ids"][0])
        assert len(draft["patch"]["nodes"]) == count
        assert all(len(n["text"]) == chars for n in draft["patch"]["nodes"])
        assert (
            client.post(f"/api/v2/projects/{identifier}/close", json={"discard": False}).status_code
            == 200
        )
        reopened = client.post(
            "/api/files/open", json={"path": str(tmp_path / "projects" / "test.ludo.json")}
        ).json()["project"]
        record = next(j for j in reopened["content"]["generation_history"] if j["id"] == job["id"])
        assert record["items"][0]["output_limits"] == {"card_count": count, "text_length": length}
    finally:
        client.__exit__(None, None, None)


def test_overproduced_cards_fail_once_keep_success_and_report_usage(tmp_path):
    provider = LimitsProvider(extra_cards=True)
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        setup_scene(client, identifier)
        assert (
            start(client, identifier, [limited_item(), limited_item(name="超量")]).status_code
            == 202
        )
        job = wait_job(client, identifier)
        assert len(provider.calls) == 2  # One provider call per item, no repair calls.
        assert len(job["draft_ids"]) == 1 and job["usage"]["total_tokens"] == 74
        failed = next(i for i in job["items"] if i["status"] == "failed")
        assert (
            failed["code"] == "output_limits"
            and "要求 2 张" in failed["error"]
            and "返回 4 张" in failed["error"]
        )
        assert failed["output_limits"] == {"card_count": 2, "text_length": "short"}
        # A manual retry preserves the selected constraints and doesn't resubmit success.
        failed["name"] = "重试合规"
        retry = {
            key: failed[key]
            for key in (
                "kind",
                "name",
                "character_id",
                "scene_id",
                "start_tick",
                "end_tick",
                "scene_context",
                "output_limits",
            )
        }
        assert start(client, identifier, [retry], request_id="manual-retry").status_code == 202
        retried = wait_job(client, identifier)
        assert len(provider.calls) == 3 and len(retried["draft_ids"]) == 1
    finally:
        client.__exit__(None, None, None)


def test_underproduced_cards_also_report_exact_mismatch(tmp_path):
    provider = FixtureProvider()
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        setup_scene(client, identifier)
        assert start(client, identifier, [limited_item()]).status_code == 202
        job = wait_job(client, identifier)
        assert job["status"] == "failed" and "返回 1 张" in job["items"][0]["error"]
        assert not job["draft_ids"] and len(provider.calls) == 1
    finally:
        client.__exit__(None, None, None)


def test_pool_length_limit_creates_one_text_without_dialogue_cards(tmp_path):
    provider = LimitsProvider(text="字" * 120)
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        setup_scene(client, identifier)
        assert start(client, identifier, [limited_item(kind="text")]).status_code == 202
        job = wait_job(client, identifier)
        assert job["status"] == "awaiting_review" and len(job["draft_ids"]) == 1
        request = provider.calls[0][1]
        assert request["output_limits"]["card_count"] is None
        assert request["entity_schema"]["properties"]["body"]["maxLength"] == 120
    finally:
        client.__exit__(None, None, None)


@pytest.mark.parametrize("kind", ["text", "dialogue"])
def test_overlong_body_is_not_saved_or_automatically_regenerated(tmp_path, kind):
    provider = LimitsProvider(text="字" * 121)
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        setup_scene(client, identifier)
        assert start(client, identifier, [limited_item(kind=kind)]).status_code == 202
        job = wait_job(client, identifier)
        assert job["status"] == "failed" and not job["draft_ids"]
        assert "120 字符" in job["items"][0]["error"]
        assert len(provider.calls) == 1 and job["usage"]["total_tokens"] == 37
    finally:
        client.__exit__(None, None, None)


@pytest.mark.parametrize(
    "bad",
    [
        {"card_count": 0},
        {"card_count": 7},
        {"card_count": True},
        {"card_count": 2.5},
        {"card_count": None},
        {"card_count": 2, "text_length": "unknown"},
    ],
)
def test_invalid_limits_are_rejected_before_spending_tokens(tmp_path, bad):
    provider = LimitsProvider()
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        setup_scene(client, identifier)
        assert start(client, identifier, [{**item(), "output_limits": bad}]).status_code == 422
        assert provider.calls == []
    finally:
        client.__exit__(None, None, None)
