import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import (
    CommandBatch,
    CommandError,
    ProjectConflict,
    apply_commands,
)
from ludo_npc.application.projects import MemoryProjects
from ludo_npc.domain.models import Project


def batch(project, *commands):
    return CommandBatch(expected_revision=project.revision, commands=list(commands))


def test_content_layout_and_noop_revisions(document):
    project = Project.model_validate(document)
    moved = apply_commands(
        project,
        batch(
            project,
            {
                "type": "move_node",
                "canvas_id": "outpost-board",
                "target": {"kind": "character", "id": "keeper"},
                "position": {"x": 700, "y": 30},
            },
        ),
    )
    assert (moved.revision, moved.content_revision, moved.layout_revision) == (2, 1, 2)
    edited = apply_commands(
        moved,
        batch(
            moved,
            {
                "type": "patch_entity",
                "target": {"kind": "character", "id": "keeper"},
                "changes": {"voice": "更谨慎"},
            },
        ),
    )
    assert (edited.revision, edited.content_revision, edited.layout_revision) == (3, 2, 2)
    noop = apply_commands(edited, batch(edited, {"type": "rename_project", "name": edited.name}))
    assert noop == edited
    with pytest.raises(ProjectConflict):
        apply_commands(edited, batch(project, {"type": "rename_project", "name": "旧修改"}))


def test_batch_all_or_nothing(document):
    store = MemoryProjects()
    project = store.add(Project.model_validate(document))
    with pytest.raises(ValidationError):
        store.apply(
            project.project_id,
            batch(
                project,
                {"type": "rename_project", "name": "不应保留"},
                {"type": "delete_entity", "target": {"kind": "character", "id": "keeper"}},
            ),
        )
    assert store.get(project.project_id) == project


def test_forward_references_in_one_transaction(document):
    project = Project.model_validate(document)
    result = apply_commands(
        project,
        batch(
            project,
            {
                "type": "put_relation",
                "relation": {
                    "id": "new-link",
                    "source": {"kind": "character", "id": "new-author"},
                    "target": {"kind": "location", "id": "outpost"},
                    "label": "居住",
                },
            },
            {
                "type": "create_entity",
                "entity": {"kind": "character", "id": "new-author", "name": "旅人"},
            },
        ),
    )
    assert result.revision == 2
    assert len(result.content.characters) == 2


def test_stable_ids_not_editable(document):
    project = Project.model_validate(document)
    with pytest.raises(CommandError):
        apply_commands(
            project,
            batch(
                project,
                {
                    "type": "patch_entity",
                    "target": {"kind": "character", "id": "keeper"},
                    "changes": {"id": "different"},
                },
            ),
        )


def test_deleting_unreferenced_entity_cleans_layout(document):
    document["content"]["characters"].append({"id": "extra", "name": "路人"})
    document["editor"]["canvases"][0]["nodes"].append(
        {"entity": {"kind": "character", "id": "extra"}, "position": {"x": 0, "y": 0}}
    )
    project = Project.model_validate(document)
    result = apply_commands(
        project,
        batch(project, {"type": "delete_entity", "target": {"kind": "character", "id": "extra"}}),
    )
    assert len(result.content.characters) == 1
    assert (result.revision, result.content_revision, result.layout_revision) == (2, 2, 2)


def test_store_copies_and_duplicate_import_conflict(document):
    store = MemoryProjects()
    project = Project.model_validate(document)
    store.add(project)
    project.name = "外部修改"
    fetched = store.get(project.project_id)
    assert fetched.name != project.name
    fetched.content.characters.clear()
    assert store.get(project.project_id).content.characters
    with pytest.raises(ProjectConflict):
        store.add(project)
