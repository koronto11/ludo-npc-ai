from copy import deepcopy

import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import CommandBatch, apply_commands
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.exports import dialogue_csv, markdown
from ludo_npc.simulation import SimulationInput, rehearse
from ludo_npc.templates import ApplyTemplate, capture
from ludo_npc.templates import apply_commands as template_commands


def project():
    data = campfire_project().model_dump(mode="json")
    graph = data["content"]["dialogues"][0]
    graph["nodes"][0]["options"] = [
        {"id": "leave-friendly", "text": "我先走了。", "target_node_id": "end-friendly"},
        {"id": "leave-refused", "text": "我不帮忙。", "target_node_id": "end-refused"},
        {"id": "leave-now", "text": "离开", "target_node_id": None},
    ]
    graph["nodes"] += [
        {"id": "end-friendly", "node_type": "ending", "label": "友好告别", "speaker_id": graph["character_id"], "text": "路上小心。", "effects": [{"op": "set_variable", "variable_id": "camp-trust", "value": 3}]},
        {"id": "end-refused", "node_type": "ending", "label": "拒绝交谈", "speaker_id": graph["character_id"], "text": "那就别再来打扰我。"},
    ]
    return Project.model_validate(data)


def play(doc, option=None, **extra):
    trial = {"dialogue_id": "camp-fire-dialogue", "started": True, "actions": []}
    if option:
        trial["actions"].append({"type": "choice", "option_id": option})
    trial.update(extra)
    return rehearse(doc, SimulationInput(expected_content_revision=doc.content_revision, at_tick=14, location_id="camp-fire", level_id="camp-level", card_trial=trial))


def active(result):
    return next(g for g in result["dialogues"] if g["id"] == "camp-fire-dialogue")


@pytest.mark.parametrize("choice,text", [("leave-friendly", "路上小心。"), ("leave-refused", "那就别再来打扰我。")])
def test_each_branch_closes_after_its_npc_line_without_an_extra_player_action(choice, text):
    doc = project()
    before = doc.model_dump_json()
    result = play(doc, choice)
    assert not result["diagnostics"]
    assert active(result)["closed"] and not active(result)["available"]
    assert active(result)["ending"]["text"] == text
    assert [f["kind"] for f in result["transcript"]] == ["npc", "player", "npc", "end"]
    assert result["transcript"][-2]["text"] == text
    assert len([f for f in result["transcript"] if f["kind"] == "player"]) == 1
    assert doc.model_dump_json() == before


def test_blank_ending_and_legacy_direct_exit_have_no_empty_npc_line():
    data = project().model_dump(mode="json")
    data["content"]["dialogues"][0]["nodes"][-1]["text"] = ""
    result = play(Project.model_validate(data), "leave-refused")
    assert [f["kind"] for f in result["transcript"]] == ["npc", "player", "end"]
    assert active(result)["ending"]["id"] == "end-refused"
    legacy = play(project(), "leave-now")
    assert active(legacy)["closed"] and active(legacy)["ending"] is None
    assert [f["kind"] for f in legacy["transcript"]] == ["npc", "player", "end"]


def test_ending_entry_effects_run_once_and_no_choices_can_run_after_closure():
    doc = project()
    result = play(doc, "leave-friendly", actions=[{"type": "choice", "option_id": "leave-friendly"}, {"type": "variable", "variable_id": "camp-injured", "value": True}])
    assert result["state"]["variables"]["camp-trust"] == 3
    assert len([f for f in result["transcript"] if f.get("node_id") == "end-friendly" and f["kind"] == "npc"]) == 1
    result = play(doc, actions=[{"type": "choice", "option_id": "leave-friendly"}, {"type": "choice", "option_id": "leave-refused"}])
    assert result["diagnostics"][-1]["code"] == "dialogue_closed"
    assert active(result)["ending"]["id"] == "end-friendly"


def test_conditions_still_rollback_choices_before_blocked_ending():
    data = project().model_dump(mode="json")
    graph = data["content"]["dialogues"][0]
    graph["nodes"][0]["options"][0]["effects"] = [{"op": "set_variable", "variable_id": "camp-trust", "value": 2}]
    graph["nodes"][-2]["condition"] = {"op": "variable", "variable_id": "camp-injured", "value": True}
    result = play(Project.model_validate(data), "leave-friendly")
    assert result["diagnostics"][-1]["code"] == "target_blocked"
    assert result["state"]["variables"]["camp-trust"] == 0
    assert not active(result)["closed"] and active(result)["ending"] is None
    assert [f["kind"] for f in result["transcript"]] == ["npc"]


def test_ending_can_be_the_start_and_global_rehearsal_records_the_closing_line():
    doc = project()
    result = play(doc, start_node_id="end-friendly")
    assert [f["kind"] for f in result["transcript"]] == ["npc", "end"]
    assert active(result)["closed"]
    result = rehearse(doc, SimulationInput(expected_content_revision=doc.content_revision, at_tick=14, location_id="camp-fire", level_id="camp-level", choices=[{"dialogue_id": "camp-fire-dialogue", "tick": 14, "option_id": "leave-friendly"}]))
    assert [f["kind"] for f in result["story_flow"]][-3:] == ["player", "npc", "end"]
    assert result["story_flow"][-2]["text"] == "路上小心。"


def test_legacy_nodes_keep_serialization_hash_and_terminal_behavior():
    doc = campfire_project()
    old = doc.model_dump(mode="json")
    assert all("node_type" not in n for g in old["content"]["dialogues"] for n in g["nodes"])
    explicit = deepcopy(old)
    for graph in explicit["content"]["dialogues"]:
        for node in graph["nodes"]:
            node["node_type"] = "speech"
    restored = Project.model_validate(explicit)
    assert restored.model_dump(mode="json") == old
    assert author_hash(restored) == author_hash(old)
    data = project().model_dump(mode="json")
    data["content"]["dialogues"][0]["nodes"][-1].pop("node_type")
    result = play(Project.model_validate(data), "leave-refused")
    assert not active(result)["closed"] and not active(result)["options"]


def test_invalid_ending_options_rejected_and_removal_keeps_reference_validation():
    data = project().model_dump(mode="json")
    data["content"]["dialogues"][0]["nodes"][-1]["options"] = [{"id": "illegal", "text": "继续"}]
    with pytest.raises(ValidationError, match="结束节点"):
        Project.model_validate(data)
    doc = project()
    graph = doc.content.dialogues[0].model_dump(mode="json")
    graph["nodes"] = [n for n in graph["nodes"] if n["id"] != "end-friendly"]
    with pytest.raises(ValidationError):
        apply_commands(doc, CommandBatch(expected_revision=doc.revision, commands=[{"type": "patch_entity", "target": {"kind": "dialogue", "id": graph["id"]}, "changes": {"nodes": graph["nodes"]}}]))


def test_templates_and_formal_exports_preserve_named_endings_and_targets():
    doc = project()
    template = capture(doc, "dialogue", "camp-fire-dialogue", "多结局模板")
    batch, identifier = template_commands(doc, template, ApplyTemplate(expected_revision=doc.revision, template_id=template.id, character_id="camp-xialan", name="复用多结局"))
    copied = apply_commands(doc, batch)
    graph = next(g for g in copied.content.dialogues if g.id == identifier)
    endings = [n for n in graph.nodes if n.node_type == "ending"]
    assert len(endings) == 2
    assert {n.text for n in endings} == {"路上小心。", "那就别再来打扰我。"}
    assert not {n.id for n in endings} & {"end-friendly", "end-refused"}
    assert {o.target_node_id for o in graph.nodes[0].options if o.target_node_id} == {n.id for n in endings}
    assert all(not n.options for n in endings)
    csv_text = dialogue_csv(doc, None)
    assert "结束节点" in csv_text and "end-friendly" in csv_text and "路上小心。" in csv_text
    assert "结束节点（台词后结束）" in markdown(doc, None)
