import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import CommandBatch, CommandError
from ludo_npc.application.projects import MemoryProjects
from ludo_npc.domain.library_order import library_ids
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.samples import outpost_project
from ludo_npc.storage import LocalProjects
from tests.test_control_widths import edit


def order(scope, ids, expected=None):
    return {
        "type": "set_library_order",
        "scope": scope,
        "order": ids,
        "expected_order": expected or [],
    }


def test_order_is_display_only_and_survives_disk_and_legacy_roundtrip(tmp_path):
    before = outpost_project()
    ids = [row.id for row in before.content.locations]
    after = edit(before, order("world", ids[::-1]))
    assert after.content == before.content
    assert after.content_revision == before.content_revision
    assert after.layout_revision == before.layout_revision + 1
    assert author_hash(after) == author_hash(before)
    store = LocalProjects(tmp_path / "data", tmp_path / "projects")
    path = tmp_path / "projects" / "ordered.ludo.json"
    try:
        store.add(after)
        store.save(after.project_id, after.revision, str(path))
    finally:
        store.shutdown()
    assert (
        Project.model_validate_json(path.read_text(encoding="utf-8")).editor.library_orders["world"]
        == ids[::-1]
    )
    legacy = before.model_dump(mode="json")
    legacy["editor"].pop("library_orders")
    assert Project.model_validate(legacy).editor.library_orders == {}


@pytest.mark.parametrize("ids", [["missing"], ["keeper"], ["outpost", "outpost"]])
def test_cross_group_missing_and_duplicate_ids_fail_atomically(ids):
    before = outpost_project()
    valid = [row.id for row in before.content.locations]
    with pytest.raises(CommandError):
        edit(before, order("world", valid), order("world", ids, valid))
    assert before.editor.library_orders == {}


def test_background_membership_is_validated_and_cleaned_after_author_changes():
    data = outpost_project().model_dump(mode="json")
    first = data["content"]["characters"][0]
    second = {**first, "id": "background-test"}
    data["content"]["characters"].append(second)
    first["importance"] = "supporting"
    second["importance"] = "background"
    data["editor"]["canvases"][0]["nodes"] = [
        {
            "entity": {"kind": "character", "id": row["id"]},
            "position": {"x": 0, "y": 0},
            "visible": True,
        }
        for row in (first, second)
    ]
    before = Project.model_validate(data)
    assert first["id"] in library_ids(before.content, before.editor, "characters")
    assert second["id"] in library_ids(before.content, before.editor, "residents")
    with pytest.raises(CommandError):
        edit(before, order("characters", [second["id"]]))
    after = edit(before, order("characters", [first["id"]]))
    changed = edit(
        after,
        {
            "type": "patch_entity",
            "target": {"kind": "character", "id": first["id"]},
            "changes": {"importance": "background"},
        },
    )
    assert changed.editor.library_orders["characters"] == []


def test_conflicts_and_undo_do_not_overwrite_later_story_edits():
    store = MemoryProjects()
    before = store.add(outpost_project())
    ids = [row.id for row in before.content.locations]
    after = store.apply(
        before.project_id,
        CommandBatch(expected_revision=before.revision, commands=[order("world", ids[::-1])]),
    )
    with pytest.raises(CommandError, match="其他编辑"):
        edit(after, order("world", ids))
    later = after.model_dump(mode="json")
    later["content"]["characters"][0]["story"] = "后续新增的背景故事"
    store._projects[before.project_id] = Project.model_validate(later)
    undone = store.undo_edit(before.project_id, after.revision, "undo")
    assert undone.editor.library_orders == {}
    assert undone.content.characters[0].story == "后续新增的背景故事"
    redone = store.undo_edit(before.project_id, undone.revision, "redo")
    assert redone.editor.library_orders == after.editor.library_orders


def test_deleted_items_are_removed_from_order_but_other_scopes_remain():
    before = outpost_project()
    event = before.content.events[0]
    after = edit(
        before,
        order("events", [event.id]),
        order("world", [row.id for row in before.content.locations]),
    )
    removed = edit(after, {"type": "delete_entity", "target": {"kind": "event", "id": event.id}})
    assert removed.editor.library_orders["events"] == []
    assert removed.editor.library_orders["world"] == after.editor.library_orders["world"]


def test_invalid_persisted_cross_group_orders_are_rejected():
    data = outpost_project().model_dump(mode="json")
    data["editor"]["library_orders"] = {"levels": [data["content"]["characters"][0]["id"]]}
    with pytest.raises(ValidationError):
        Project.model_validate(data)
