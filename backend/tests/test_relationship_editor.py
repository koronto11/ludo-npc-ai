from copy import deepcopy

import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import CommandBatch, CommandError, apply_commands
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.generation import GenerateInput, context_for
from ludo_npc.samples import outpost_project
from ludo_npc.simulation import SimulationInput, rehearse
from ludo_npc.storage import LocalProjects


def edit(project, *commands):
    return apply_commands(
        project,
        CommandBatch.model_validate(
            {"expected_revision": project.revision, "commands": list(commands)}
        ),
    )


def note(value, **extra):
    return {"type": "set_character_note", "character_id": "keeper", "note": value, **extra}


def test_old_documents_keep_default_relations_and_draft_fingerprint():
    data = outpost_project().model_dump(mode="json")
    data["editor"].pop("character_notes")
    for row in data["content"]["relations"]:
        row.pop("direction")
        row.pop("description")
    restored = Project.model_validate(data)
    assert restored.editor.character_notes == {}
    assert restored.content.relations[0].direction == "forward"
    assert author_hash(data) == author_hash(restored)


def test_note_is_editor_only_and_outside_model_context_and_rehearsal():
    before = outpost_project()
    after = edit(before, note("仅作者可见的记忆提示", expected_note=""))
    assert after.content == before.content
    assert after.content_revision == before.content_revision
    assert after.layout_revision == before.layout_revision + 1
    assert author_hash(after) == author_hash(before)
    assert (
        rehearse(after, SimulationInput(expected_content_revision=after.content_revision))["state"]
        == rehearse(before, SimulationInput(expected_content_revision=before.content_revision))[
            "state"
        ]
    )
    request = GenerateInput(
        request_id="test-note",
        expected_revision=after.revision,
        profile_id="fixture",
        instructions="写故事",
        items=[{"kind": "character", "name": "守门人", "target_id": "keeper"}],
    )
    assert context_for(after, request, request.items[0]) == context_for(
        before, request, request.items[0]
    )


def test_notes_reject_conflicts_invalid_targets_and_lengths_atomically():
    project = edit(outpost_project(), note("原备注"))
    with pytest.raises(CommandError, match="已被修改"):
        edit(project, note("覆盖", expected_note=""))
    with pytest.raises(CommandError, match="不存在"):
        edit(project, note("bad", character_id="missing"))
    with pytest.raises(ValidationError):
        edit(project, note("x" * 3001))
    with pytest.raises(CommandError):
        edit(project, note("不应保存"), note("bad", character_id="missing"))
    assert project.editor.character_notes == {"keeper": "原备注"}


def test_note_cleanup_and_reference_integrity():
    project = Project(
        content={"characters": [{"kind": "character", "id": "keeper", "name": "旅人"}]}
    )
    project = edit(project, note("提示"))
    assert edit(project, note("", expected_note="提示")).editor.character_notes == {}
    deleted = edit(
        project, {"type": "delete_entity", "target": {"kind": "character", "id": "keeper"}}
    )
    assert deleted.editor.character_notes == {}
    data = project.model_dump(mode="json")
    data["editor"]["character_notes"]["missing"] = "孤立备注"
    with pytest.raises(ValidationError):
        Project.model_validate(data)


def test_relation_direction_and_description_preserve_state_and_other_fields():
    project = outpost_project()
    relation = project.content.relations[0].model_dump(mode="json")
    updated = edit(
        project,
        {
            "type": "put_relation",
            "relation": {**relation, "direction": "both", "description": "互相提供消息"},
        },
    )
    assert updated.content.relations[0].direction == "both"
    assert updated.content.characters == project.content.characters
    assert updated.editor == project.editor
    assert (
        rehearse(updated, SimulationInput(expected_content_revision=updated.content_revision))[
            "state"
        ]
        == rehearse(project, SimulationInput(expected_content_revision=project.content_revision))[
            "state"
        ]
    )
    bad = deepcopy(relation)
    bad["direction"] = "reverse"
    with pytest.raises(ValidationError):
        edit(project, {"type": "put_relation", "relation": bad})


def test_notes_and_direction_survive_real_file_reopen(tmp_path):
    store = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        original = store.add(outpost_project())
        relation = original.content.relations[0].model_dump(mode="json")
        updated = store.apply(
            original.project_id,
            CommandBatch.model_validate(
                {
                    "expected_revision": original.revision,
                    "commands": [
                        note("记住这个人物"),
                        {"type": "put_relation", "relation": {**relation, "direction": "both"}},
                    ],
                }
            ),
        )
        path = tmp_path / "projects" / "notes.ludo.json"
        store.save(updated.project_id, updated.revision, str(path))
    finally:
        store.shutdown()
    reopened = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        result = reopened.open_file(str(path))["project"]
        assert result["editor"]["character_notes"]["keeper"] == "记住这个人物"
        assert result["content"]["relations"][0]["direction"] == "both"
    finally:
        reopened.shutdown()
