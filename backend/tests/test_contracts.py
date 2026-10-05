import math

import pytest
from pydantic import ValidationError

from ludo_npc.domain.models import Project, Variable
from ludo_npc.migration import dump_project, load_document


def invalid(document):
    with pytest.raises(ValidationError):
        Project.model_validate(document)


def test_empty_and_independent_world(document):
    assert not Project().content.characters
    project = load_document(document)
    assert project.content.characters[0].id == "keeper"
    assert "eve" not in {row.id for row in project.content.characters}
    assert Project.model_validate_json(dump_project(project)) == project


@pytest.mark.parametrize("value", [True, "2", 2.0, 1, 3])
def test_strict_schema_version(document, value):
    document["schema_version"] = value
    invalid(document)


def test_global_entity_ids_unique(document):
    document["content"]["locations"][0]["id"] = "keeper"
    invalid(document)


@pytest.mark.parametrize(
    "target", [{"kind": "event", "id": "keeper"}, {"kind": "character", "id": "missing"}]
)
def test_relation_requires_correct_type_and_target(document, target):
    document["content"]["relations"][0]["source"] = target
    invalid(document)


def test_canvas_references_and_duplicates(document):
    nodes = document["editor"]["canvases"][0]["nodes"]
    nodes.append(nodes[0].copy())
    invalid(document)
    nodes.pop()
    nodes[0]["entity"]["id"] = "missing"
    invalid(document)


def test_location_cycle(document):
    document["content"]["locations"][0]["parent_id"] = "gate"
    invalid(document)


@pytest.mark.parametrize(
    "field", ["entry_node_id", "route", "option", "duplicate_option", "speaker"]
)
def test_dialogue_integrity(document, field):
    dialogue = document["content"]["dialogues"][0]
    if field == "entry_node_id":
        dialogue[field] = "absent"
    elif field == "route":
        dialogue["entry_routes"] = [{"node_id": "absent", "condition": {"op": "always"}}]
    elif field == "option":
        dialogue["nodes"][0]["options"][0]["target_node_id"] = "absent"
    elif field == "duplicate_option":
        dialogue["nodes"][0]["options"][1]["id"] = "ask-arrival"
    else:
        dialogue["nodes"][0]["speaker_id"] = "outpost"
    invalid(document)


@pytest.mark.parametrize(
    "typ,value",
    [
        ("boolean", 1),
        ("number", True),
        ("number", "1"),
        ("text", 1),
        ("number", math.nan),
        ("number", math.inf),
    ],
)
def test_variable_type_and_nonfinite(typ, value):
    with pytest.raises(ValidationError):
        Variable(id="v", name="变量", value_type=typ, default=value)


@pytest.mark.parametrize(
    "condition",
    [
        {"op": "variable", "variable_id": "supplies", "value": True},
        {"op": "event_occurred", "event_id": "missing"},
        {"op": "knows", "character_id": "keeper", "fact_id": "missing"},
        {"op": "at_location", "character_id": "keeper", "location_id": "missing"},
    ],
)
def test_condition_references_and_types(document, condition):
    document["content"]["rules"][0]["condition"] = condition
    invalid(document)


def test_boolean_ordering_is_not_numeric(document):
    document["content"]["variables"].append(
        {"id": "flag", "name": "开关", "value_type": "boolean", "default": False}
    )
    document["content"]["rules"][0]["condition"] = {
        "op": "variable",
        "variable_id": "flag",
        "comparison": "gt",
        "value": False,
    }
    invalid(document)


@pytest.mark.parametrize(
    "effect",
    [
        {"op": "set_variable", "variable_id": "supplies", "value": "five"},
        {"op": "increment_variable", "variable_id": "absent", "amount": 1},
        {"op": "grant_knowledge", "character_id": "missing", "fact_id": "caravan-arrival"},
        {"op": "move_character", "character_id": "keeper", "location_id": "missing"},
        {"op": "unlock_text", "text_id": "missing"},
    ],
)
def test_effect_references_and_types(document, effect):
    document["content"]["events"][0]["effects"] = [effect]
    invalid(document)


def test_future_fact_cannot_be_initial_knowledge(document):
    document["content"]["initial_state"]["characters"]["keeper"]["known_fact_ids"] = [
        "caravan-arrival"
    ]
    invalid(document)


@pytest.mark.parametrize("tick", [-1, 4])
def test_choice_time_bounds(document, tick):
    document["content"]["simulation_cases"][1]["choices"][0]["tick"] = tick
    invalid(document)


def test_choice_history_sorted(document):
    choices = document["content"]["simulation_cases"][1]["choices"]
    choices.append(choices[0] | {"tick": 2})
    invalid(document)


def test_drafts_do_not_overwrite_definition(document):
    project = Project.model_validate(document)
    assert not project.content.characters[0].story
    assert project.content.drafts[0].patch["story"]


@pytest.mark.parametrize("patch", [{"api_key": "secret"}, {"id": "new"}, {"goals": "wrong-type"}])
def test_invalid_draft_fields(document, patch):
    document["content"]["drafts"][0]["patch"] = patch
    invalid(document)


def test_confirmed_fields_and_revisions(document):
    document["content"]["characters"][0]["confirmed_fields"].append("made-up")
    invalid(document)
    document["content"]["characters"][0]["confirmed_fields"].pop()
    document["content_revision"] = 2
    invalid(document)


def test_project_has_no_connection_credential_fields(document):
    document["api_key"] = "secret"
    invalid(document)
