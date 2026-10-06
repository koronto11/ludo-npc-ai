from copy import deepcopy

import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import CommandBatch, CommandError, apply_commands
from ludo_npc.domain.integrity import validate_project
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.storage import LocalProjects
from tests.test_npc_groups import grouped_project


def edit(project, *commands):
    return apply_commands(
        project,
        CommandBatch.model_validate(
            {
                "expected_revision": project.revision,
                "commands": commands,
            }
        ),
    )


def resize(kind="group", control_id="group", width=350, **extra):
    return {
        "type": "set_level_control_width",
        "level_id": "level",
        "kind": kind,
        "control_id": control_id,
        "width": width,
        **extra,
    }


def with_event():
    data = grouped_project().model_dump(mode="json")
    data["content"]["events"] += [
        {
            "id": "event",
            "kind": "event",
            "name": "来访",
            "scheduled_at": 3,
            "scope": {"level_id": "level", "track_id": "track"},
        }
    ]
    return Project.model_validate(data)


def test_widths_round_trip_without_changing_story_or_draft_fingerprint(tmp_path):
    before = with_event()
    after = edit(before, resize(), resize("event", "event", 480))
    validate_project(after)
    assert after.content == before.content
    assert after.content_revision == before.content_revision
    assert after.layout_revision == before.layout_revision + 1
    assert author_hash(after) == author_hash(before)
    store = LocalProjects(tmp_path / "data", tmp_path / "projects")
    path = tmp_path / "projects" / "widths.ludo.json"
    try:
        store.add(after)
        store.save(after.project_id, after.revision, str(path))
    finally:
        store.shutdown()
    reopened = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        restored = Project.model_validate(reopened.open_file(str(path))["project"])
        assert restored.editor.level_control_widths["level"].groups == {"group": 350}
        assert restored.editor.level_control_widths["level"].events == {"event": 480}
    finally:
        reopened.shutdown()
    legacy = before.model_dump(mode="json")
    legacy["editor"].pop("level_control_widths")
    assert Project.model_validate(legacy).editor.level_control_widths == {}


def test_widths_reject_bad_targets_bounds_and_cross_level_events_atomically():
    before = with_event()
    for command in [resize(control_id="missing"), resize(width=200), resize(level_id="missing")]:
        with pytest.raises(CommandError):
            edit(before, resize(), command)
    for width in [179, 1201, True, 350.5]:
        with pytest.raises(ValidationError):
            edit(before, resize(width=width))
    data = before.model_dump(mode="json")
    data["content"]["events"][-1]["scope"] = None
    with pytest.raises(CommandError, match="不属于"):
        edit(Project.model_validate(data), resize("event", "event"))
    assert before.editor.level_control_widths == {}


def test_removing_controls_cleans_width_metadata():
    before = edit(with_event(), resize(), resize("event", "event", 480))
    level = deepcopy(before.content.levels[0].model_dump(mode="json"))
    level["npc_groups"] = []
    for appearance in level["appearances"]:
        appearance["npc_group_id"] = None
    after = edit(
        before,
        {"type": "put_level", "level": level},
        {
            "type": "delete_entity",
            "target": {"kind": "event", "id": "event"},
        },
    )
    validate_project(after)
    assert after.editor.level_control_widths["level"].groups == {}
    assert after.editor.level_control_widths["level"].events == {}
    deleted = edit(after, {"type": "delete_level", "level_id": "level"})
    assert deleted.editor.level_control_widths == {}
