from copy import deepcopy

import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import CommandBatch, CommandError, apply_commands
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.simulation import SimulationError, SimulationInput, rehearse
from ludo_npc.storage import LocalProjects


def inputs(**trial):
    return {
        "at_tick": 14,
        "location_id": "camp-fire",
        "level_id": "camp-level",
        "card_trial": {"dialogue_id": "camp-fire-dialogue", **trial},
    }


def play(project=None, **kwargs):
    project = project or campfire_project()
    return rehearse(
        project, SimulationInput(expected_content_revision=project.content_revision, **kwargs)
    )


def active(result):
    return next(g for g in result["dialogues"] if g["id"] == "camp-fire-dialogue")


def test_card_start_bypasses_routes_without_changing_author_or_entering_preview_effects():
    project = campfire_project()
    before = project.model_dump_json()
    request = inputs()
    request["variable_overrides"] = {"camp-injured": True}
    preview = play(project, **request)
    assert active(preview)["node_id"] == "greeting"
    assert preview["transcript"] == []
    assert preview["state"]["variables"]["camp-trust"] == 0
    request["card_trial"]["started"] = True
    assert active(play(project, **request))["node_id"] == "greeting"
    request["card_trial"]["use_entry_routes"] = True
    assert active(play(project, **request))["node_id"] == "injury"
    assert project.model_dump_json() == before


def test_inline_state_change_keeps_card_and_old_choices_and_does_not_repeat_entry_effects():
    request = inputs(
        started=True,
        start_node_id="injury",
        actions=[
            {"type": "variable", "variable_id": "camp-injured", "value": True},
            {"type": "variable", "variable_id": "camp-injured", "value": False},
        ],
    )
    result = play(**request)
    assert active(result)["node_id"] == "injury"
    assert result["state"]["variables"]["camp-trust"] == 1
    assert len([f for f in result["transcript"] if f["kind"] == "npc"]) == 1
    request = inputs(
        started=True,
        actions=[
            {"type": "variable", "variable_id": "camp-injured", "value": True},
            {"type": "choice", "option_id": "camp-ask-help"},
        ],
    )
    result = play(**request)
    assert active(result)["node_id"] == "injury"
    assert [f["kind"] for f in result["transcript"]] == ["npc", "state", "player", "npc"]
    assert result["state"]["variables"]["camp-trust"] == 1
    assert not result["diagnostics"]


def test_card_play_enforces_presence_and_option_conditions():
    wrong_scene = inputs(started=True)
    wrong_scene["location_id"] = "camp-clinic"
    result = play(**wrong_scene)
    assert result["diagnostics"][0]["code"] == "appearance_blocked"
    assert result["transcript"] == []
    result = play(
        **inputs(started=True, actions=[{"type": "choice", "option_id": "camp-ask-help"}])
    )
    assert active(result)["node_id"] == "greeting"
    assert result["diagnostics"][0]["code"] == "choice_unavailable"
    assert not any(frame["kind"] == "player" for frame in result["transcript"])


def test_changed_card_condition_is_visible_and_does_not_jump():
    data = campfire_project().model_dump(mode="json")
    data["content"]["dialogues"][0]["nodes"][0]["condition"] = {
        "op": "variable",
        "variable_id": "camp-injured",
        "value": False,
    }
    result = play(
        Project.model_validate(data),
        **inputs(
            started=True,
            actions=[{"type": "variable", "variable_id": "camp-injured", "value": True}],
        ),
    )
    assert active(result)["node_id"] == "greeting"
    assert not active(result)["available"]


def test_bad_trial_inputs_are_rejected_and_bounded():
    for trial in [
        {"started": True, "start_node_id": "missing"},
        {
            "started": True,
            "actions": [{"type": "variable", "variable_id": "camp-injured", "value": 1}],
        },
        {"dialogue_id": "missing"},
        {"started": True, "actions": [{"type": "choice", "option_id": "missing"}]},
    ]:
        with pytest.raises(SimulationError):
            play(**inputs(**trial))
    with pytest.raises(ValidationError):
        play(**inputs(actions=[{"type": "choice", "option_id": "camp-ask-road"}]))
    with pytest.raises(ValidationError):
        play(
            **inputs(
                started=True,
                actions=[{"type": "variable", "variable_id": "camp-injured", "value": True}] * 129,
            )
        )


def test_trial_rolls_back_failed_choice_and_transcript_and_obeys_step_limit():
    data = campfire_project().model_dump(mode="json")
    injury = data["content"]["dialogues"][0]["nodes"][2]
    injury["condition"] = {
        "op": "variable",
        "variable_id": "camp-trust",
        "comparison": "gte",
        "value": 2,
    }
    result = play(
        Project.model_validate(data),
        **inputs(
            started=True,
            actions=[
                {"type": "variable", "variable_id": "camp-injured", "value": True},
                {"type": "choice", "option_id": "camp-ask-help"},
            ],
        ),
    )
    assert active(result)["node_id"] == "greeting"
    assert result["state"]["variables"]["camp-trust"] == 0
    assert result["diagnostics"][0]["code"] == "target_blocked"
    assert [f["kind"] for f in result["transcript"]] == ["npc", "state"]
    limited = play(
        max_steps=1,
        **inputs(
            started=True,
            actions=[{"type": "variable", "variable_id": "camp-injured", "value": True}],
        ),
    )
    assert limited["complete"] is False
    assert limited["diagnostics"][0]["code"] == "step_limit"


def record(identifier="play-one"):
    request = inputs(
        started=True,
        actions=[
            {"type": "variable", "variable_id": "camp-injured", "value": True},
            {"type": "choice", "option_id": "camp-ask-help"},
        ],
    )
    result = play(**request)
    return {
        "id": identifier,
        "name": "受伤求助",
        "created_at": "2026-10-06T00:00:00Z",
        "content_revision": result["content_revision"],
        "character_id": "camp-xialan",
        "dialogue_id": "camp-fire-dialogue",
        "character_name": "夏岚",
        "dialogue_name": "篝火旁的问候",
        "scene_name": "营地篝火",
        "inputs": request,
        "transcript": result["transcript"],
    }


def edit(project, command):
    return apply_commands(
        project,
        CommandBatch.model_validate({"expected_revision": project.revision, "commands": [command]}),
    )


def test_records_are_append_only_editor_data_and_survive_dialogue_changes_and_deletion():
    project = campfire_project()
    first = edit(project, {"type": "save_play_record", "record": record()})
    assert first.content == project.content
    assert first.content_revision == project.content_revision
    assert author_hash(first) == author_hash(project)
    second = edit(first, {"type": "save_play_record", "record": record("play-two")})
    assert len(second.editor.play_records) == 2
    altered = record()
    altered["transcript"][0]["text"] = "覆盖旧对白"
    with pytest.raises(CommandError):
        edit(second, {"type": "save_play_record", "record": altered})
    assert (
        edit(second, {"type": "save_play_record", "record": record()}).revision == second.revision
    )
    data = second.model_dump(mode="json")
    snapshot = deepcopy(data["editor"]["play_records"])
    data["content"]["dialogues"] = []
    for level in data["content"]["levels"]:
        for appearance in level["appearances"]:
            appearance["dialogue_ids"] = []
    data["content"]["simulation_cases"] = []
    data["editor"]["dialogue_layouts"] = {}
    assert (
        Project.model_validate(data).model_dump(mode="json")["editor"]["play_records"] == snapshot
    )


def test_records_survive_local_json_reopen(tmp_path):
    store = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        project = store.add(campfire_project())
        saved = store.apply(
            project.project_id,
            CommandBatch.model_validate(
                {
                    "expected_revision": project.revision,
                    "commands": [{"type": "save_play_record", "record": record()}],
                }
            ),
        )
        path = tmp_path / "projects" / "play.ludo.json"
        store.save(saved.project_id, saved.revision, str(path))
    finally:
        store.shutdown()
    reopened = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        restored = reopened.open_file(str(path))["project"]
        assert (
            restored["editor"]["play_records"][0]["transcript"][2]["text"]
            == "我受了点伤，能帮忙看看吗？"
        )
    finally:
        reopened.shutdown()


def test_record_delete_restore_is_editor_only_idempotent_and_source_isolated(tmp_path):
    project = campfire_project()
    case_id = "shared-record-id"
    project = edit(
        project, {"type": "put_simulation_case", "case": {"id": case_id, "name": "旧记录"}}
    )
    project = edit(project, {"type": "save_play_record", "record": record(case_id)})
    snapshot = project.editor.play_records[0].model_dump(mode="json")
    command = {
        "type": "set_play_record_deleted",
        "source": "play_record",
        "record_id": case_id,
        "deleted": True,
    }
    deleted = edit(project, command)
    assert deleted.content_revision == project.content_revision
    assert deleted.content == project.content
    assert author_hash(deleted) == author_hash(project)
    assert deleted.editor.play_records[0].model_dump(mode="json") == snapshot
    assert len(deleted.editor.deleted_play_records) == 1
    assert edit(deleted, command).revision == deleted.revision
    both = edit(deleted, {**command, "source": "simulation_case"})
    assert len(both.editor.deleted_play_records) == 2
    restored = edit(both, {**command, "deleted": False})
    assert restored.editor.deleted_play_records[0].source == "simulation_case"
    assert restored.editor.play_records[0].model_dump(mode="json") == snapshot
    with pytest.raises(CommandError):
        edit(project, {**command, "record_id": "missing"})
    with pytest.raises(CommandError):
        edit(project, {**command, "record_id": "missing", "deleted": False})
    store = LocalProjects(tmp_path / "data", tmp_path / "projects")
    path = tmp_path / "projects" / "deleted.ludo.json"
    try:
        store.add(both)
        store.save(both.project_id, both.revision, str(path))
    finally:
        store.shutdown()
    reopened = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        loaded = Project.model_validate(reopened.open_file(str(path))["project"])
        assert len(loaded.editor.deleted_play_records) == 2
        loaded = edit(loaded, {**command, "deleted": False})
        loaded = edit(loaded, {**command, "source": "simulation_case", "deleted": False})
        assert loaded.editor.deleted_play_records == []
        assert loaded.editor.play_records[0].model_dump(mode="json") == snapshot
    finally:
        reopened.shutdown()


def test_record_delete_batch_is_atomic_and_tombstone_keys_are_unique():
    project = edit(campfire_project(), {"type": "save_play_record", "record": record()})
    command = {
        "type": "set_play_record_deleted",
        "source": "play_record",
        "record_id": "play-one",
        "deleted": True,
    }
    with pytest.raises(CommandError):
        apply_commands(
            project,
            CommandBatch.model_validate(
                {
                    "expected_revision": project.revision,
                    "commands": [command, {**command, "record_id": "missing"}],
                }
            ),
        )
    assert project.editor.deleted_play_records == []
    deleted = edit(project, command).model_dump(mode="json")
    deleted["editor"]["deleted_play_records"] *= 2
    with pytest.raises(ValidationError):
        Project.model_validate(deleted)


def test_trial_api_keeps_revision_guard_and_does_not_persist(client):
    project = campfire_project()
    client.post("/api/v2/projects/import", json={"document": project.model_dump(mode="json")})
    url = f"/api/v2/projects/{project.project_id}/simulate"
    assert (
        client.post(url, json={"expected_content_revision": 99, **inputs(started=True)}).status_code
        == 409
    )
    response = client.post(url, json={"expected_content_revision": 1, **inputs(started=True)})
    assert response.status_code == 200
    assert active(response.json())["node_id"] == "greeting"
    assert client.get(f"/api/v2/projects/{project.project_id}").json()["revision"] == 1
