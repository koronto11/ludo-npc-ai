from copy import deepcopy

import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import CommandBatch, CommandError
from ludo_npc.application.projects import MemoryProjects
from ludo_npc.domain.integrity import validate_project
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from tests.test_control_widths import edit, with_event


def order(keys=None, expected=None, **extra):
    return {"type": "set_level_control_order", "level_id": "level",
            "order": keys if keys is not None else ["group:group", "event:event"],
            "expected_order": expected or [], **extra}


def test_order_is_persisted_layout_and_legacy_files_keep_their_default_order():
    before = with_event()
    after = edit(before, order())
    validate_project(after)
    assert after.content == before.content
    assert after.content_revision == before.content_revision
    assert after.layout_revision == before.layout_revision + 1
    assert author_hash(after) == author_hash(before)
    reopened = Project.model_validate_json(after.model_dump_json())
    assert reopened.editor.level_control_orders["level"] == ["group:group", "event:event"]
    legacy = before.model_dump(mode="json")
    legacy["editor"].pop("level_control_orders")
    assert Project.model_validate(legacy).editor.level_control_orders == {}


@pytest.mark.parametrize("keys", [["group:missing"], ["group:group", "group:group"], ["appearance:appearance"], ["event:delivery"]])
def test_invalid_or_group_member_targets_fail_atomically(keys):
    before = with_event()
    with pytest.raises(CommandError):
        edit(before, order(), order(keys, ["group:group", "event:event"]))
    assert before.editor.level_control_orders == {}


def test_order_rejects_intervening_layout_changes_and_invalid_keys():
    project = edit(with_event(), order())
    with pytest.raises(CommandError, match="其他编辑"):
        edit(project, order(["event:event", "group:group"]))
    for keys in [[True], ["character:keeper"], ["event:"]]:
        with pytest.raises(ValidationError):
            edit(project, order(keys))


def test_control_removal_cleans_only_its_layout_entry():
    before = edit(with_event(), order())
    after = edit(before, {"type": "delete_entity", "target": {"kind": "event", "id": "event"}})
    assert after.editor.level_control_orders["level"] == ["group:group"]
    level = deepcopy(after.content.levels[0].model_dump(mode="json"))
    level["npc_groups"] = []
    level["appearances"][0]["npc_group_id"] = None
    dissolved = edit(after, {"type": "put_level", "level": level})
    validate_project(dissolved)
    assert dissolved.editor.level_control_orders["level"] == []
    deleted = edit(dissolved, {"type": "delete_level", "level_id": "level"})
    assert deleted.editor.level_control_orders == {}


def test_undo_redo_preserves_later_unrelated_story_edits():
    store = MemoryProjects()
    before = store.add(with_event())
    changed = store.apply(before.project_id, CommandBatch(expected_revision=before.revision, commands=[order()]))
    data = changed.model_dump(mode="json")
    data["content"]["characters"][0]["story"] = "后来编辑的故事"
    store._projects[before.project_id] = Project.model_validate(data)
    undone = store.undo_edit(before.project_id, changed.revision, "undo")
    assert undone.editor.level_control_orders == {}
    assert undone.content.characters[0].story == "后来编辑的故事"
    redone = store.undo_edit(before.project_id, undone.revision, "redo")
    assert redone.editor.level_control_orders == changed.editor.level_control_orders
    assert redone.content == undone.content
