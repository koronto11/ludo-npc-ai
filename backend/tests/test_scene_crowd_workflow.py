from copy import deepcopy

import pytest

from ludo_npc.application.commands import CommandBatch, apply_commands
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.simulation import SimulationInput, rehearse
from tests.test_generation import FixtureProvider, setup_client, start, wait_job


def commands(client, identifier, rows):
    project = client.get(f"/api/v2/projects/{identifier}").json()
    return client.post(
        f"/api/v2/projects/{identifier}/commands",
        json={"expected_revision": project["revision"], "commands": rows},
    )


def setup_scene(client, identifier):
    level = {
        "id": "level-a",
        "name": "第一关",
        "tracks": [{"id": "track-a", "name": "篝火", "location_id": "outpost"}],
        "appearances": [
            {
                "id": "appearance-a",
                "character_id": "keeper",
                "track_id": "track-a",
                "start_tick": 2,
                "end_tick": 6,
            }
        ],
    }
    assert commands(client, identifier, [{"type": "put_level", "level": level}]).status_code == 200
    return level


def item(kind="dialogue", name="闲聊"):
    return {
        "kind": kind,
        "name": name,
        "character_id": "keeper" if kind == "dialogue" else None,
        "scene_id": "outpost",
        "start_tick": 2,
        "end_tick": 6,
        "scene_context": {
            "level_id": "level-a",
            "track_id": "track-a",
            "location_id": "outpost",
            "appearance_id": "appearance-a" if kind == "dialogue" else None,
            "group_name": "篝火居民",
            "mode": "people" if kind == "dialogue" else "pool",
            "start_tick": 2,
            "end_tick": 6,
        },
    }


@pytest.mark.parametrize("kind", ["text", "dialogue"])
def test_scene_batch_scope_review_link_and_local_reopen(tmp_path, kind):
    provider = FixtureProvider()
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        level = setup_scene(client, identifier)
        assert (
            start(client, identifier, [item(kind, "居民一"), item(kind, "居民二")]).status_code
            == 202
        )
        job = wait_job(client, identifier)
        assert job["status"] == "awaiting_review"
        assert all(row["scene_context"]["level_id"] == level["id"] for row in job["items"])
        before = client.get(f"/api/v2/projects/{identifier}").json()
        drafts = [d for d in before["content"]["drafts"] if d["task_id"] == job["id"]]
        assert len(drafts) == 2
        assert provider.calls[0]["context"]["scene_placement"]["track_id"] == "track-a"
        key = "texts" if kind == "text" else "dialogues"
        assert not any(
            row["id"] in {d["target"]["id"] for d in drafts} for row in before["content"][key]
        )
        accepted = commands(
            client,
            identifier,
            [
                {
                    "type": "review_draft",
                    "draft_id": d["id"],
                    "action": "accept",
                    "expected_author_hash": author_hash(before),
                    "values": d["patch"],
                }
                for d in drafts
            ],
        )
        assert accepted.status_code == 200, accepted.text
        project = Project.model_validate(accepted.json())
        if kind == "dialogue":
            linked = project.content.levels[0].appearances[0].dialogue_ids
            assert all(d["target"]["id"] in linked for d in drafts)
            assert "gate-conversation" in linked  # Existing default dialogue stays available.
            result = rehearse(
                project,
                SimulationInput(
                    expected_content_revision=project.content_revision,
                    level_id="level-a",
                    location_id="outpost",
                    at_tick=2,
                ),
            )
            assert all(
                next(g for g in result["dialogues"] if g["id"] == d["target"]["id"])["available"]
                for d in drafts
            )
        assert (
            client.post(
                f"/api/v2/projects/{identifier}/save", json={"expected_revision": project.revision}
            ).status_code
            == 200
        )
        assert (
            client.post(f"/api/v2/projects/{identifier}/close", json={"discard": False}).status_code
            == 200
        )
        reopened = client.post(
            "/api/files/open", json={"path": str(tmp_path / "projects" / "test.ludo.json")}
        ).json()["project"]
        assert reopened["content"]["levels"] == accepted.json()["content"]["levels"]
        assert all(
            d["scene_context"]["group_name"] == "篝火居民"
            for d in reopened["content"]["drafts"]
            if d["task_id"] == job["id"]
        )
    finally:
        client.__exit__(None, None, None)


@pytest.mark.parametrize("change", ["track", "appearance", "actor", "time", "mode", "range"])
def test_generation_rejects_wrong_scene_destination_before_provider_call(tmp_path, change):
    provider = FixtureProvider()
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        setup_scene(client, identifier)
        bad = item()
        if change == "track":
            bad["scene_context"]["track_id"] = "missing"
        if change == "appearance":
            bad["scene_context"]["appearance_id"] = "missing"
        if change == "actor":
            bad["character_id"] = None
        if change == "time":
            bad["end_tick"] = 9
        if change == "mode":
            bad["scene_context"]["mode"] = "pool"
        if change == "range":
            bad["scene_context"]["end_tick"] = 9
            bad["end_tick"] = 9
        assert start(client, identifier, [bad]).status_code in (400, 422)
        assert provider.calls == []
    finally:
        client.__exit__(None, None, None)


def test_scope_is_immutable_and_changed_appearance_cannot_be_rebound_by_rebase(tmp_path):
    client, identifier, _ = setup_client(tmp_path, FixtureProvider())
    try:
        level = setup_scene(client, identifier)
        assert start(client, identifier, [item()]).status_code == 202
        job = wait_job(client, identifier)
        p = client.get(f"/api/v2/projects/{identifier}").json()
        draft = next(d for d in p["content"]["drafts"] if d["id"] == job["draft_ids"][0])
        changed = deepcopy(draft)
        changed["scene_context"]["appearance_id"] = "forged"
        assert (
            commands(client, identifier, [{"type": "put_draft", "draft": changed}]).status_code
            == 422
        )
        level["appearances"][0]["end_tick"] = 3
        assert (
            commands(client, identifier, [{"type": "put_level", "level": level}]).status_code == 200
        )
        p = client.get(f"/api/v2/projects/{identifier}").json()
        assert (
            commands(
                client,
                identifier,
                [
                    {
                        "type": "rebase_draft",
                        "draft_id": draft["id"],
                        "expected_author_hash": author_hash(p),
                    }
                ],
            ).status_code
            == 200
        )
        p = Project.model_validate(client.get(f"/api/v2/projects/{identifier}").json())
        with pytest.raises(ValueError, match="出场已改变"):
            apply_commands(
                p,
                CommandBatch.model_validate(
                    {
                        "expected_revision": p.revision,
                        "commands": [
                            {
                                "type": "review_draft",
                                "draft_id": draft["id"],
                                "action": "accept",
                                "expected_author_hash": author_hash(p),
                                "values": draft["patch"],
                            }
                        ],
                    }
                ),
            )
        assert not any(g.id == draft["target"]["id"] for g in p.content.dialogues)
    finally:
        client.__exit__(None, None, None)
