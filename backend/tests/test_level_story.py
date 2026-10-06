from copy import deepcopy

from ludo_npc.application.commands import CommandBatch, apply_commands
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.models import Project
from ludo_npc.simulation import SimulationInput, rehearse


def run(project=None, **values):
    project = project or campfire_project()
    inputs = {"at_tick": 14, "level_id": "camp-level", "location_id": "camp-fire"}
    inputs.update(values)
    return rehearse(
        project, SimulationInput(expected_content_revision=project.content_revision, **inputs)
    )


def choose(option=None, action="choice", tick=14, sequence=0):
    return {
        "tick": tick,
        "dialogue_id": "camp-fire-dialogue",
        "option_id": option,
        "action": action,
        "sequence": sequence,
    }


def test_story_stream_follows_successful_player_npc_order_without_changing_card_transcript():
    result = run(choices=[choose(action="start"), choose("camp-ask-road", sequence=1)])
    dialogue = [f for f in result["story_flow"] if f["kind"] in ("npc", "player")]
    assert [f["kind"] for f in dialogue] == ["npc", "player", "npc"]
    assert [f["text"] for f in dialogue] == [f["text"] for f in result["transcript"]]
    assert all(f["dialogue_id"] == "camp-fire-dialogue" for f in dialogue)
    assert result["story_flow"][0]["presentation"] == "scene"
    assert not result["diagnostics"]


def test_story_play_keeps_authored_conditional_entry_and_presence_gate():
    result = run(variable_overrides={"camp-injured": True}, choices=[choose(action="start")])
    assert next(f for f in result["story_flow"] if f["kind"] == "npc")["node_id"] == "injury"
    wrong_scene = run(location_id="camp-clinic", choices=[choose(action="start")])
    assert wrong_scene["diagnostics"][0]["code"] == "appearance_blocked"
    assert not any(f["kind"] == "npc" for f in wrong_scene["story_flow"])


def test_rejected_choice_removes_story_effects_and_speech():
    data = campfire_project().model_dump(mode="json")
    option = data["content"]["dialogues"][0]["nodes"][0]["options"][0]
    option["effects"] = [{"op": "increment_variable", "variable_id": "camp-trust", "amount": 5}]
    data["content"]["dialogues"][0]["nodes"][1]["condition"] = {
        "op": "variable",
        "variable_id": "camp-injured",
        "comparison": "eq",
        "value": True,
    }
    result = run(
        Project.model_validate(data),
        choices=[choose(action="start"), choose(option["id"], sequence=1)],
    )
    assert result["diagnostics"][0]["code"] == "target_blocked"
    assert result["state"]["variables"]["camp-trust"] == 0
    assert [f["kind"] for f in result["story_flow"] if f["kind"] in ("player", "npc")] == ["npc"]


def test_environment_waits_for_gate_unlocks_once_and_can_repeat_on_return():
    data = campfire_project().model_dump(mode="json")
    data["content"]["texts"] = [
        {
            "id": "secret-note",
            "name": "Camp note",
            "body": "Frozen environmental prose",
            "condition": {"op": "scene", "location_id": "camp-fire"},
        }
    ]
    data["content"]["events"] = [
        {
            "id": "open-note",
            "name": "Read permission",
            "scheduled_at": 5,
            "effects": [{"op": "unlock_text", "text_id": "secret-note"}],
            "scope": {"level_id": "camp-level", "track_id": "camp-track-fire"},
        }
    ]
    project = Project.model_validate(data)
    before = project.model_dump(mode="json")
    assert not any(
        f.get("presentation") == "environment" for f in run(project, at_tick=4)["story_flow"]
    )
    inputs = [
        {"tick": 8, "location_id": "camp-clinic", "sequence": 0},
        {"tick": 12, "location_id": "camp-fire", "sequence": 1},
    ]
    result = run(project, scene_changes=inputs)
    env = [f for f in result["story_flow"] if f.get("presentation") == "environment"]
    assert [f["tick"] for f in env] == [5, 12]
    assert len([f for f in result["story_flow"] if f.get("presentation") == "event"]) == 1
    assert not any(
        f.get("presentation") == "scene" and f["tick"] == 12
        for f in run(project, at_tick=9, scene_changes=inputs)["story_flow"]
    )
    assert project.model_dump(mode="json") == before


def test_story_snapshots_save_without_new_project_contract_and_survive_author_edit():
    project = campfire_project()
    before = deepcopy(project.content.characters)
    result = run(project, choices=[choose(action="start")])
    frames = [
        {
            key: frame[key]
            for key in ("kind", "label", "text", "node_id", "speaker", "tick")
            if key in frame
        }
        for frame in result["story_flow"]
    ]
    record = {
        "id": "play-level-test",
        "name": "Level snapshot",
        "content_revision": project.content_revision,
        "inputs": {
            "at_tick": 14,
            "level_id": "camp-level",
            "location_id": "camp-fire",
            "choices": [choose(action="start")],
        },
        "transcript": frames,
    }
    saved = apply_commands(
        project,
        CommandBatch(
            expected_revision=project.revision,
            commands=[{"type": "save_play_record", "record": record}],
        ),
    )
    assert saved.editor.play_records[0].transcript[-1].text == result["transcript"][-1]["text"]
    assert saved.content.characters == before
    assert saved.content_revision == project.content_revision


def test_card_trials_do_not_receive_scene_story_frames():
    result = run(card_trial={"dialogue_id": "camp-fire-dialogue", "started": True})
    assert result["story_flow"] == []
    assert result["transcript"][0]["node_id"] == "greeting"


def test_environment_time_windows_are_not_skipped_when_advancing_to_an_anchor():
    data = campfire_project().model_dump(mode="json")
    data["content"]["texts"] = [
        {
            "id": "brief-text",
            "name": "Brief",
            "body": "Only at five",
            "condition": {"op": "time", "comparison": "eq", "value": 5},
        }
    ]
    result = run(Project.model_validate(data))
    assert [f["tick"] for f in result["story_flow"] if f.get("presentation") == "environment"] == [
        5
    ]


def test_story_presentation_limit_does_not_change_execution_or_author_data():
    data = campfire_project().model_dump(mode="json")
    data["content"]["texts"] = [
        {"id": f"text-{i}", "name": f"Text {i}", "body": "Environment"} for i in range(2100)
    ]
    project = Project.model_validate(data)
    result = run(project)
    assert result["complete"]
    assert result["story_flow_truncated"]
    assert len(result["story_flow"]) == 2048
    assert len(result["texts"]) == 2100
    assert len(project.content.texts) == 2100
