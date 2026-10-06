import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from ludo_npc.domain.models import Project
from ludo_npc.migration import load_document
from ludo_npc.samples import outpost_project
from ludo_npc.simulation import SimulationInput, rehearse


def preview(project, tick=0, **kwargs):
    return rehearse(
        project,
        SimulationInput(expected_content_revision=project.content_revision, at_tick=tick, **kwargs),
    )


def changed(project, edit):
    data = project.model_dump(mode="json")
    edit(data["content"])
    return Project.model_validate(data)


def choice(tick, option, graph="gate-conversation"):
    return {"tick": tick, "dialogue_id": graph, "option_id": option}


def test_independent_world_events_knowledge_and_choices():
    p = outpost_project()
    before = preview(p, 2)
    assert before["state"]["variables"]["supplies"] == 2
    assert not before["state"]["characters"]["keeper"]["known_fact_ids"]
    assert not before["dialogues"][0]["options"][0]["available"]
    after = preview(p, 3, choices=[choice(3, "ask-arrival")])
    assert after["state"]["variables"]["supplies"] == 7
    assert after["state"]["characters"]["keeper"]["known_fact_ids"] == ["caravan-arrival"]
    assert after["dialogues"][0]["node_id"] == "arrival-answer"
    assert after["complete"]


def test_rewind_filters_future_choices_and_scene_changes():
    p = outpost_project()
    inputs = {
        "choices": [choice(3, "ask-arrival")],
        "scene_changes": [{"tick": 3, "location_id": "outpost"}],
    }
    assert preview(p, 3, **inputs)["dialogues"][0]["node_id"] == "arrival-answer"
    earlier = preview(p, 2, **inputs)
    assert earlier["dialogues"][0]["node_id"] == "greeting"
    assert earlier["state"]["scene_id"] is None
    assert earlier["state"]["variables"]["supplies"] == 2


def test_pure_replay_and_branch_isolation():
    p = outpost_project()
    original = p.model_dump_json()
    normal = preview(p, 2)
    low = preview(p, 2, variable_overrides={"supplies": 0})
    assert low["state"]["characters"]["keeper"]["behavior"] == "限制访客进入储水间"
    assert low["texts"][0]["available"]
    assert preview(p, 2) == normal
    assert p.model_dump_json() == original


def test_event_rescheduling_and_once_only_effects():
    p = changed(outpost_project(), lambda c: c["events"][0].update(scheduled_at=8))
    assert preview(p, 3)["state"]["variables"]["supplies"] == 2
    assert preview(p, 8)["state"]["variables"]["supplies"] == 7
    assert preview(p, 10**12)["state"]["variables"]["supplies"] == 7
    assert len([r for r in preview(p, 10**12)["log"] if r["kind"] == "event"]) == 1


def test_future_knowledge_blocks_entire_effect_group():
    p = changed(outpost_project(), lambda c: c["events"][0].update(scheduled_at=1))
    early = preview(p, 1)
    assert early["events"][0]["status"] == "blocked"
    assert early["events"][0]["effect_problem"]
    assert early["state"]["variables"]["supplies"] == 2
    assert preview(p, 3)["state"]["variables"]["supplies"] == 7


def test_scene_conditions_and_historical_changes():
    def edit(c):
        c["events"][0]["condition"] = {"op": "scene", "location_id": "gate"}

    p = changed(outpost_project(), edit)
    assert preview(p, 3, location_id="outpost")["events"][0]["status"] == "blocked"
    records = [{"tick": 4, "location_id": "gate"}]
    assert (
        preview(p, 3, location_id="outpost", scene_changes=records)["state"]["variables"][
            "supplies"
        ]
        == 2
    )
    assert (
        preview(p, 4, location_id="outpost", scene_changes=records)["state"]["variables"][
            "supplies"
        ]
        == 7
    )


def test_exact_time_condition_is_not_skipped_by_large_seek():
    def edit(c):
        c["rules"][0]["condition"] = {"op": "time", "comparison": "eq", "value": 2}

    result = preview(changed(outpost_project(), edit), 10**9)
    assert next(r for r in result["log"] if r["kind"] == "rule")["tick"] == 2


def test_invalid_choice_is_diagnostic_without_effects_or_entry():
    p = outpost_project()
    r = preview(p, 1, choices=[choice(1, "ask-arrival")])
    assert r["diagnostics"][0]["code"] == "choice_unavailable"
    assert not r["dialogues"][0]["started"]
    assert not r["log"]


def test_node_effects_only_on_entry_and_choice_transaction_rolls_back():
    def edit(c):
        c["dialogues"][0]["nodes"][0]["effects"] = [
            {"op": "increment_variable", "variable_id": "supplies", "amount": 1}
        ]
        c["dialogues"][0]["nodes"][0]["options"][1].update(
            target_node_id="arrival-answer",
            effects=[{"op": "increment_variable", "variable_id": "supplies", "amount": 10}],
        )

    p = changed(outpost_project(), edit)
    assert preview(p, 1)["state"]["variables"]["supplies"] == 2
    started = preview(
        p, 1, choices=[{"tick": 1, "dialogue_id": "gate-conversation", "action": "start"}]
    )
    assert started["state"]["variables"]["supplies"] == 3
    failed = preview(p, 1, choices=[choice(1, "leave")])
    assert failed["state"]["variables"]["supplies"] == 2
    assert failed["diagnostics"][0]["code"] == "target_blocked"


def test_closed_conversation_requires_restart():
    p = outpost_project()
    records = [choice(1, "leave"), choice(3, "ask-arrival")]
    assert preview(p, 3, choices=records)["diagnostics"][0]["code"] == "dialogue_closed"
    records.insert(1, {"tick": 3, "dialogue_id": "gate-conversation", "action": "restart"})
    assert preview(p, 3, choices=records)["dialogues"][0]["node_id"] == "arrival-answer"


def test_steps_stop_chain_and_mark_partial_result():
    r = preview(outpost_project(), 3, variable_overrides={"supplies": 0}, max_steps=1)
    assert not r["complete"]
    assert r["diagnostics"][-1]["code"] == "step_limit"


def test_dialogue_loops_have_explicit_visit_limit():
    def edit(c):
        o = c["dialogues"][0]["nodes"][0]["options"][1]
        o["target_node_id"] = "greeting"

    p = changed(outpost_project(), edit)
    r = preview(p, 1, choices=[choice(1, "leave") for _ in range(129)])
    assert not r["complete"]
    assert r["diagnostics"][-1]["code"] == "dialogue_limit"


def test_stable_same_tick_priority_and_chained_rules():
    def edit(c):
        c["events"] = [
            {
                "id": "arrival",
                "kind": "event",
                "name": "高优先级",
                "scheduled_at": 1,
                "priority": 1,
                "effects": [{"op": "set_variable", "variable_id": "supplies", "value": 0}],
            },
            {
                "id": "b",
                "kind": "event",
                "name": "低优先级",
                "scheduled_at": 1,
                "priority": 0,
                "effects": [{"op": "increment_variable", "variable_id": "supplies", "amount": 3}],
            },
        ]
        c["simulation_cases"] = []

    r = preview(changed(outpost_project(), edit), 1)
    assert [row["source_id"] for row in r["log"] if row["kind"] == "event"] == ["arrival", "b"]
    assert r["state"]["variables"]["supplies"] == 3


def test_cases_and_api_stale_rehearsal(client):
    p = outpost_project()
    stored = client.post(
        "/api/v2/projects/import", json={"document": p.model_dump(mode="json")}
    ).json()
    endpoint = f"/api/v2/projects/{stored['project_id']}/simulate"
    r = client.post(endpoint, json={"expected_content_revision": 1, "case_id": "case-after"})
    assert r.status_code == 200 and r.json()["dialogues"][0]["node_id"] == "arrival-answer"
    assert client.post(endpoint, json={"expected_content_revision": 2}).status_code == 409
    assert (
        client.post(
            endpoint, json={"expected_content_revision": 1, "variable_overrides": {"unknown": 1}}
        ).status_code
        == 422
    )
    assert client.get(f"/api/v2/projects/{p.project_id}").json() == stored


def test_saved_branch_duplicate_record_ids_rejected():
    records = [
        choice(1, "leave") | {"record_id": "same"},
        choice(3, "ask-arrival") | {"record_id": "same"},
    ]
    with pytest.raises(ValidationError):
        preview(outpost_project(), 3, choices=records)


def test_lighthouse_uses_identical_engine_without_builtin_ids():
    p = load_document(
        json.loads(
            (Path(__file__).resolve().parents[2] / "docs/examples/lighthouse.ludo.json").read_text(
                encoding="utf-8"
            )
        )
    )
    before = preview(p, 2)
    after = preview(p, 3)
    assert before["state"]["characters"]["eve"]["location_id"] == "clinic"
    assert after["state"]["characters"]["eve"]["location_id"] != "clinic"
    graph = next(d for d in after["dialogues"] if d["name"] == "伊芙条件对话")
    protected = preview(p, 3, choices=[choice(3, "protect", graph["id"])])
    assert protected["state"]["characters"]["eve"]["behavior"] == "愿意出庭作证"
    rewound = preview(p, 2, choices=[choice(3, "protect", graph["id"])])
    assert rewound["state"]["characters"]["eve"]["behavior"] != "愿意出庭作证"
    evidence = next(v.id for v in p.content.variables if v.id.startswith("var-evidence-public"))
    assert (
        preview(p, 3, variable_overrides={evidence: False})["state"]["characters"]["eve"][
            "location_id"
        ]
        == "clinic"
    )


def test_same_tick_scene_and_choice_keep_recorded_order():
    def edit(c):
        c["dialogues"][0]["nodes"][0]["options"][1]["condition"] = {
            "op": "scene",
            "location_id": "gate",
        }
        c["dialogues"][0]["nodes"][0]["options"][1]["effects"] = [
            {"op": "increment_variable", "variable_id": "supplies", "amount": 1}
        ]

    p = changed(outpost_project(), edit)
    result = preview(
        p,
        1,
        scene_changes=[
            {"tick": 1, "location_id": "gate", "sequence": 0},
            {"tick": 1, "location_id": "outpost", "sequence": 2},
        ],
        choices=[choice(1, "leave") | {"sequence": 1}],
    )
    assert result["state"]["variables"]["supplies"] == 3
    assert result["state"]["scene_id"] == "outpost"
    assert not result["diagnostics"]


def test_scene_record_order_collision_is_rejected():
    with pytest.raises(ValidationError):
        preview(
            outpost_project(),
            1,
            scene_changes=[{"tick": 1, "location_id": "gate", "sequence": 0}],
            choices=[choice(1, "leave") | {"sequence": 0}],
        )


def test_branch_save_command_persists_inputs_but_not_runtime(client):
    p = outpost_project()
    client.post("/api/v2/projects/import", json={"document": p.model_dump(mode="json")})
    base = f"/api/v2/projects/{p.project_id}"
    response = client.post(
        base + "/commands",
        json={
            "expected_revision": 1,
            "commands": [
                {
                    "type": "put_simulation_case",
                    "case": {
                        "id": "mine",
                        "name": "自定义分支",
                        "at_tick": 4,
                        "variable_overrides": {"supplies": 0},
                        "scene_changes": [{"tick": 3, "location_id": "gate", "sequence": 0}],
                        "choices": [choice(4, "ask-arrival") | {"sequence": 1}],
                    },
                }
            ],
        },
    )
    assert response.status_code == 200
    saved = response.json()
    preview_result = client.post(
        base + "/simulate",
        json={"expected_content_revision": saved["content_revision"], "case_id": "mine"},
    ).json()
    assert preview_result["state"]["variables"]["supplies"] == 5
    assert saved["content"]["initial_state"]["variables"] == {}
    assert saved["content"]["characters"][0]["goals"] == p.content.characters[0].goals
    assert client.get(base).json() == saved


def test_unlock_does_not_bypass_scene_or_knowledge_conditions():
    def edit(c):
        c["texts"][0]["condition"] = {"op": "scene", "location_id": "gate"}
        c["events"][0]["effects"].append({"op": "unlock_text", "text_id": "water-notice"})

    p = changed(outpost_project(), edit)
    assert not preview(p, 2, location_id="gate")["texts"][0]["available"]
    assert not preview(p, 3, location_id="outpost")["texts"][0]["available"]
    assert preview(p, 3, location_id="gate")["texts"][0]["available"]


def test_entry_preview_explains_conditional_start_without_changing_execution():
    def edit(c):
        next(n for n in c["dialogues"][0]["nodes"] if n["id"] == "arrival-answer")["condition"] = {"op": "always"}
        c["dialogues"][0]["entry_routes"] = [{
            "node_id": "arrival-answer",
            "condition": {"op": "variable", "variable_id": "supplies", "comparison": "eq", "value": 2},
        }]

    p = changed(outpost_project(), edit)
    result = preview(p, 0)
    entry = result["dialogues"][0]["entry_preview"]
    assert entry["node_id"] == "arrival-answer"
    assert entry["route_index"] == 0
    assert entry["reason"]["passed"]
    assert not result["dialogues"][0]["started"]
    assert not any(row["kind"] == "node" for row in result["log"])
    assert preview(p, 0, variable_overrides={"supplies": 1})["dialogues"][0]["entry_preview"]["route_index"] is None
    started = preview(p, 0, choices=[{"tick": 0, "dialogue_id": "gate-conversation", "action": "start"}])
    assert started["dialogues"][0]["node_id"] == entry["node_id"]


def test_default_entry_preview_obeys_node_conditions():
    p = changed(outpost_project(), lambda c: c["dialogues"][0]["nodes"][0].update(condition={"op": "variable", "variable_id": "supplies", "comparison": "eq", "value": 99}))
    result = preview(p, 0)
    assert result["dialogues"][0]["entry_preview"]["node_id"] is None
    assert not result["dialogues"][0]["entry_preview"]["reason"]["passed"]
