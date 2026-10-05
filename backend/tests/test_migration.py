import json

import pytest
from pydantic import ValidationError

from ludo_npc.migration import DocumentError, dump_project, load_document
from ludo_npc.tools import generated_artifacts, read_document

from .conftest import ROOT


def test_seed_migration_preserves_authored_content(legacy):
    project = load_document(legacy)
    by_id = {row.id: row for row in project.content.characters}
    for item in legacy["entities"]:
        if item["kind"] == "character":
            assert by_id[item["id"]].name == item["name"]
            assert by_id[item["id"]].story == item.get("summary", "")
    positions = {
        node.entity.id: node.position.model_dump() for node in project.editor.canvases[0].nodes
    }
    assert positions == {item["id"]: item["position"] for item in legacy["entities"]}
    assert len(project.content.relations) == len(legacy["relations"])
    migrated_text = [node.text for graph in project.content.dialogues for node in graph.nodes]
    assert set(legacy["dialogue"].values()) <= set(migrated_text)
    assert legacy["notes"]["letter"] in [row.body for row in project.content.texts]
    assert project.metadata.migration.legacy_preview_snapshot.trust == legacy["scenario"]["trust"]
    assert project.project_id == load_document(legacy).project_id
    assert load_document(json.loads(dump_project(project))) == project


def test_legacy_credentials_removed(legacy):
    legacy["modelProfile"]["apiKey"] = "DO-NOT-EXPORT-123"
    legacy["entities"][0]["apiKey"] = "DO-NOT-EXPORT-123"
    legacy["apiKey"] = "DO-NOT-EXPORT-123"
    exported = dump_project(load_document(legacy))
    assert "DO-NOT-EXPORT" not in exported
    assert "modelProfile" not in exported


def test_non_seed_world_does_not_invent_seed_logic():
    old = {
        "version": 1,
        "name": "雪地村落",
        "world": {"name": "寒原"},
        "entities": [
            {
                "id": "hunter",
                "kind": "character",
                "name": "猎户",
                "position": {"x": 20, "y": 20},
                "knows": "冬天已经来临",
            }
        ],
        "relations": [],
        "dialogue": {"custom": "晚些再上山吧。"},
    }
    project = load_document(old)
    assert [c.id for c in project.content.characters] == ["hunter"]
    assert not project.content.events
    assert any(row.body == "晚些再上山吧。" for row in project.content.texts)
    assert "伊芙" not in dump_project(project)


@pytest.mark.parametrize("change", ["duplicate", "dangling", "date", "version"])
def test_bad_legacy_rejected(legacy, change):
    if change == "duplicate":
        legacy["entities"].append(legacy["entities"][0].copy())
    elif change == "dangling":
        legacy["relations"][0]["source"] = "missing"
    elif change == "date":
        next(row for row in legacy["entities"] if row["kind"] == "event")["day"] = 99
    else:
        legacy["version"] = True
    with pytest.raises((DocumentError, ValidationError)):
        load_document(legacy)


def test_choice_history_and_unreplayable_snapshot(legacy):
    legacy["scenario"].update(
        day=4, protected=True, protectedDay=3, toldOrigin=True, toldOriginDay=2
    )
    project = load_document(legacy)
    assert [(r.tick, r.option_id) for r in project.content.simulation_cases[0].choices] == [
        (2, "origin"),
        (3, "protect"),
    ]
    legacy["scenario"]["protectedDay"] = None
    project = load_document(legacy)
    assert [r.option_id for r in project.content.simulation_cases[0].choices] == ["origin"]
    assert project.metadata.migration.legacy_preview_snapshot.protected
    assert any("protect" in warning for warning in project.metadata.migration.warnings)


@pytest.mark.parametrize("text", ['{"version":1,"version":2}', '{"value":NaN}', "[]"])
def test_file_reader_rejects_ambiguous_json(tmp_path, text):
    path = tmp_path / "invalid.json"
    path.write_text(text, encoding="utf-8")
    with pytest.raises(DocumentError):
        read_document(path)


def test_generated_contracts_and_examples_are_current():
    for path, content in generated_artifacts(ROOT).items():
        assert path.read_text(encoding="utf-8") == content, f"Regenerate: {path}"
