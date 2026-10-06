import json
from copy import deepcopy

import pytest

from ludo_npc.domain.integrity import validate_project
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.samples import outpost_project
from tests.test_generation import FixtureProvider, setup_client, start, wait_job
from tests.test_scene_crowd_workflow import commands, item, setup_scene


def grouped_project():
    data = outpost_project().model_dump(mode="json")
    data["content"]["levels"] = [
        {
            "id": "level",
            "name": "关卡",
            "tracks": [{"id": "track", "name": "营地", "location_id": "outpost"}],
            "npc_groups": [{"id": "group", "name": "居民", "track_id": "track"}],
            "appearances": [
                {
                    "id": "appearance",
                    "character_id": "keeper",
                    "npc_group_id": "group",
                    "track_id": "track",
                    "start_tick": 2,
                    "end_tick": 6,
                }
            ],
        }
    ]
    return Project.model_validate(data)


def test_group_membership_json_round_trip_and_reference_validation():
    project = grouped_project()
    validate_project(project)
    assert (
        Project.model_validate_json(project.model_dump_json())
        .content.levels[0]
        .appearances[0]
        .npc_group_id
        == "group"
    )
    for field, value in [("npc_group_id", "missing"), ("track_id", None)]:
        broken = project.model_dump(mode="json")
        broken["content"]["levels"][0]["appearances"][0][field] = value
        with pytest.raises(ValueError):
            validate_project(Project.model_validate(broken))


def test_empty_optional_group_fields_preserve_legacy_author_hash_without_mutating_input():
    project = grouped_project().model_dump(mode="json")
    level = project["content"]["levels"][0]
    level.pop("npc_groups")
    level["appearances"][0].pop("npc_group_id")
    before = deepcopy(project)
    expected = author_hash(project)
    assert project == before
    normalized = Project.model_validate(project)
    assert author_hash(normalized) == expected
    assert project == before


class SpeakerProvider(FixtureProvider):
    def __init__(self, speaker):
        super().__init__()
        self.speaker = speaker

    async def complete(self, *args, **kwargs):
        text, usage = await super().complete(*args, **kwargs)
        value = json.loads(text)
        value["patch"]["nodes"][0]["speaker_id"] = self.speaker
        return json.dumps(value), usage


@pytest.mark.parametrize(
    "speaker,expected",
    [(None, "awaiting_review"), ("keeper", "awaiting_review"), ("another", "failed")],
)
def test_scene_npc_request_enforces_one_actor_and_adoption_retains_group(
    tmp_path, speaker, expected
):
    provider = SpeakerProvider(speaker)
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        level = setup_scene(client, identifier)
        level["npc_groups"] = [{"id": "residents", "name": "居民", "track_id": "track-a"}]
        level["appearances"][0]["npc_group_id"] = "residents"
        assert (
            commands(client, identifier, [{"type": "put_level", "level": level}]).status_code == 200
        )
        assert start(client, identifier, [item()]).status_code == 202
        job = wait_job(client, identifier)
        assert job["status"] == expected
        assert provider.calls[0]["single_npc"]["character_id"] == "keeper"
        data = client.get(f"/api/v2/projects/{identifier}").json()
        if expected == "awaiting_review":
            draft = next(d for d in data["content"]["drafts"] if d["id"] == job["draft_ids"][0])
            assert draft["patch"]["nodes"][0]["speaker_id"] == "keeper"
            result = commands(
                client,
                identifier,
                [
                    {
                        "type": "review_draft",
                        "draft_id": draft["id"],
                        "action": "accept",
                        "expected_author_hash": author_hash(data),
                        "values": draft["patch"],
                    }
                ],
            )
            assert result.status_code == 200, result.text
            assert (
                result.json()["content"]["levels"][0]["appearances"][0]["npc_group_id"]
                == "residents"
            )
        else:
            assert not job["draft_ids"]
    finally:
        client.__exit__(None, None, None)
