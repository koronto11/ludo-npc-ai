from copy import deepcopy

import pytest

from ludo_npc.application.commands import CommandBatch, apply_commands
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.integrity import validate_project
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.simulation import SimulationInput, rehearse
from ludo_npc.storage import LocalProjects
from tests.test_generation import FixtureProvider, setup_client, start, wait_job
from tests.test_scene_crowd_workflow import commands, item, setup_scene


def bound_project():
    data = campfire_project().model_dump(mode="json")
    graph = data["content"]["dialogues"][0]
    for node in graph["nodes"]:
        node["condition"] = {
            "op": "all",
            "conditions": [
                {
                    "op": "appearance",
                    "level_id": "camp-level",
                    "appearance_id": "camp-appearance-xialan",
                },
                node["condition"],
            ],
        }
    return Project.model_validate(data)


def apply(project, *rows):
    return apply_commands(
        project,
        CommandBatch.model_validate({"expected_revision": project.revision, "commands": rows}),
    )


def preview(project, tick=14, location="camp-fire", level="camp-level", **extra):
    result = rehearse(
        project,
        SimulationInput(
            expected_content_revision=project.content_revision,
            at_tick=tick,
            location_id=location,
            level_id=level,
            **extra,
        ),
    )
    return next(d for d in result["dialogues"] if d["id"] == "camp-fire-dialogue")


def moved(project):
    level = project.content.levels[0].model_dump(mode="json")
    row = level["appearances"][0]
    row.update(
        track_id="camp-track-clinic",
        start_tick=28,
        end_tick=34,
        start_anchor_id=None,
        end_anchor_id=None,
    )
    return apply(project, {"type": "put_level", "level": level})


def test_follow_reads_current_scene_and_time_and_does_not_mutate_dialogue_or_inputs():
    project = bound_project()
    before = project.model_dump_json()
    assert preview(project)["available"]
    changed = moved(project)
    assert not preview(changed)["available"]
    assert preview(changed, 30, "camp-clinic")["available"]
    assert not preview(changed, 35, "camp-clinic")["available"]
    assert not preview(changed, 30, "camp-fire")["available"]
    assert changed.content.dialogues == project.content.dialogues
    assert project.model_dump_json() == before


def test_follow_honors_occurrence_conditions_and_actual_level_even_without_trial_presence_gate():
    project = bound_project()
    level = project.content.levels[0].model_dump(mode="json")
    level["appearances"][0]["condition"] = {
        "op": "variable",
        "variable_id": "camp-injured",
        "value": True,
    }
    changed = apply(project, {"type": "put_level", "level": level})
    assert not preview(changed)["available"]
    assert preview(changed, variable_overrides={"camp-injured": True})["available"]
    assert not preview(project, level=None)["available"]
    other = deepcopy(level)
    other["id"] = "other-level"
    changed = apply(project, {"type": "put_level", "level": other})
    assert not preview(changed, level="other-level")["available"]


@pytest.mark.parametrize(
    "mutation", ["remove-appearance", "remove-level", "recursive-condition", "missing-reference"]
)
def test_invalid_follow_dependencies_are_rejected_atomically(mutation):
    project = bound_project()
    before = project.model_dump_json()
    level = project.content.levels[0].model_dump(mode="json")
    if mutation == "remove-appearance":
        level["appearances"] = level["appearances"][1:]
        row = {"type": "put_level", "level": level}
    elif mutation == "remove-level":
        row = {"type": "delete_level", "level_id": level["id"]}
    elif mutation == "recursive-condition":
        level["appearances"][0]["condition"] = {
            "op": "not",
            "condition": {
                "op": "appearance",
                "level_id": level["id"],
                "appearance_id": level["appearances"][0]["id"],
            },
        }
        row = {"type": "put_level", "level": level}
    else:
        nodes = project.content.dialogues[0].model_dump(mode="json")["nodes"]
        nodes[0]["condition"] = {
            "op": "appearance",
            "level_id": level["id"],
            "appearance_id": "missing",
        }
        row = {
            "type": "patch_entity",
            "target": {"kind": "dialogue", "id": "camp-fire-dialogue"},
            "changes": {"nodes": nodes},
        }
    with pytest.raises(ValueError):
        apply(project, row)
    assert project.model_dump_json() == before


def test_anchored_movement_follows_and_other_visit_retains_its_dialogue():
    project = bound_project()
    level = project.content.levels[0].model_dump(mode="json")
    row = level["appearances"][0]
    level["anchors"].append({"id": "bound-start", "name": "开场", "tick": 10})
    row["start_anchor_id"] = "bound-start"
    project = apply(project, {"type": "put_level", "level": level})
    level["anchors"][-1]["tick"] = 18
    row["start_tick"] = 18
    changed = apply(project, {"type": "put_level", "level": level})
    assert not preview(changed, 14)["available"]
    assert preview(changed, 18)["available"]
    assert changed.content.dialogues[1] == project.content.dialogues[1]
    assert changed.content.levels[0].appearances[-1] == project.content.levels[0].appearances[-1]


def test_new_scene_generation_has_dynamic_gate_and_keeps_option_rules(tmp_path):
    client, identifier, _ = setup_client(tmp_path, FixtureProvider())
    try:
        level = setup_scene(client, identifier)
        assert start(client, identifier, [item()]).status_code == 202
        job = wait_job(client, identifier)
        data = client.get(f"/api/v2/projects/{identifier}").json()
        draft = next(d for d in data["content"]["drafts"] if d["id"] == job["draft_ids"][0])
        gate = draft["patch"]["nodes"][0]["condition"]["conditions"][0]
        assert gate == {"op": "appearance", "level_id": "level-a", "appearance_id": "appearance-a"}
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
        level = result.json()["content"]["levels"][0]
        level["appearances"][0].update(start_tick=8, end_tick=12)
        changed = commands(client, identifier, [{"type": "put_level", "level": level}])
        assert changed.status_code == 200, changed.text
        p = Project.model_validate(changed.json())
        r = rehearse(
            p,
            SimulationInput(
                expected_content_revision=p.content_revision,
                at_tick=9,
                location_id="outpost",
                level_id="level-a",
            ),
        )
        assert next(g for g in r["dialogues"] if g["id"] == draft["target"]["id"])["available"]
    finally:
        client.__exit__(None, None, None)


def test_manual_profile_and_follow_binding_survive_file_and_process_reopen(tmp_path):
    original = bound_project()
    store = LocalProjects(tmp_path / "data", tmp_path / "projects")
    path = tmp_path / "projects" / "profile.ludo.json"
    try:
        store.add(original)
        edited = store.apply(
            original.project_id,
            CommandBatch.model_validate(
                {
                    "expected_revision": original.revision,
                    "commands": [
                        {
                            "type": "patch_entity",
                            "target": {"kind": "character", "id": "camp-xialan"},
                            "changes": {
                                "story": "手写的商旅故事",
                                "personality": ["谨慎"],
                                "voice": "简短温和",
                                "confirmed_fields": ["story", "voice"],
                            },
                        }
                    ],
                }
            ),
        )
        moved_level = moved(edited).content.levels[0].model_dump(mode="json")
        edited = store.apply(
            edited.project_id,
            CommandBatch.model_validate(
                {
                    "expected_revision": edited.revision,
                    "commands": [{"type": "put_level", "level": moved_level}],
                }
            ),
        )
        store.save(edited.project_id, edited.revision, str(path))
    finally:
        store.shutdown()
    reopened = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        loaded = Project.model_validate(reopened.open_file(str(path))["project"])
        actor = next(c for c in loaded.content.characters if c.id == "camp-xialan")
        assert actor.story == "手写的商旅故事"
        assert actor.confirmed_fields == ["story", "voice"]
        assert loaded.content.initial_state == original.content.initial_state
        assert loaded.content.relations == original.content.relations
        assert preview(loaded, 30, "camp-clinic")["available"]
        validate_project(loaded)
    finally:
        reopened.shutdown()
