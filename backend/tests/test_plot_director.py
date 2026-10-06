"""Level-scoped plot execution, anchor binding and backwards compatibility."""

from copy import deepcopy

import pytest

from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.storage import LocalProjects
from tests.test_planning import edit, planned, simulate


def with_plot(kind="event"):
    project = planned()
    row = {
        "id": "night-watch",
        "kind": kind,
        "name": "夜间警戒",
        "scope": {"level_id": "camp", "track_id": "fire"},
        "condition": {"op": "always"},
        "effects": [{"op": "set_behavior", "character_id": "keeper", "behavior": "巡视营地"}],
    }
    if kind == "event":
        row.update(scheduled_at=0, anchor_id="arrival")
    return edit(project, {"type": "create_entity", "entity": row})


@pytest.mark.parametrize("kind", ["event", "rule"])
def test_scoped_plot_requires_level_and_scene_even_with_shared_locations(kind):
    project = with_plot(kind)
    other = deepcopy(project.content.levels[0].model_dump(mode="json"))
    other.update(id="other-level", name="其他关卡", appearances=[])
    project = edit(project, {"type": "put_level", "level": other})
    for level, location in [(None, "outpost"), ("other-level", "outpost"), ("camp", "gate")]:
        result = simulate(project, at_tick=0, level_id=level, location_id=location)
        assert result["state"]["characters"]["keeper"]["behavior"] != "巡视营地"
    result = simulate(project, at_tick=0, level_id="camp", location_id="outpost")
    assert result["state"]["characters"]["keeper"]["behavior"] == "巡视营地"
    assert len([item for item in result["log"] if item["source_id"] == "night-watch"]) == 1
    late = simulate(project, at_tick=9, level_id="camp", location_id="outpost")
    assert len([item for item in late["log"] if item["source_id"] == "night-watch"]) == 1


def test_event_fires_when_entering_scene_and_rewind_preserves_definition():
    project = with_plot()
    result = simulate(
        project,
        at_tick=8,
        level_id="camp",
        location_id="gate",
        scene_changes=[{"tick": 4, "location_id": "outpost", "sequence": 0}],
    )
    assert next(item for item in result["log"] if item["source_id"] == "night-watch")["tick"] == 4
    assert (
        simulate(project, at_tick=3, level_id="camp", location_id="gate")["state"]["characters"][
            "keeper"
        ]["behavior"]
        != "巡视营地"
    )
    assert project.content.events[-1].scheduled_at == 0


def test_anchor_move_detach_and_restore_preserve_event_reference():
    project = with_plot()
    level = project.content.levels[0].model_dump(mode="json")
    original = deepcopy(level)
    level["anchors"][0]["tick"] = 2
    level["appearances"][0]["start_tick"] = 2
    moved = edit(project, {"type": "put_level", "level": level})
    assert moved.content.events[-1].scheduled_at == 2
    level["anchors"] = level["anchors"][1:]
    level["appearances"][0]["start_anchor_id"] = None
    detached = edit(moved, {"type": "put_level", "level": level})
    assert detached.content.events[-1].anchor_id is None
    assert detached.content.events[-1].scheduled_at == 2
    restored = edit(
        detached,
        {"type": "put_level", "level": original},
        {
            "type": "patch_entity",
            "target": {"kind": "event", "id": "night-watch"},
            "changes": {"anchor_id": "arrival", "scheduled_at": 0},
        },
    )
    assert restored.content.events[-1].anchor_id == "arrival"
    assert restored.content.events[-1].scheduled_at == 0


@pytest.mark.parametrize(
    "changes",
    [
        {"scope": {"level_id": "missing", "track_id": None}},
        {"scope": {"level_id": "camp", "track_id": "missing"}},
        {"anchor_id": "missing"},
        {"scheduled_at": 3},
        {"scope": None},
    ],
)
def test_invalid_scope_or_anchor_is_rejected_atomically(changes):
    project = with_plot()
    original = project.model_dump()
    with pytest.raises(ValueError):
        edit(
            project,
            {
                "type": "patch_entity",
                "target": {"kind": "event", "id": "night-watch"},
                "changes": changes,
            },
        )
    assert project.model_dump() == original


def test_referenced_scene_and_level_cannot_be_deleted():
    project = with_plot()
    level = project.content.levels[0].model_dump(mode="json")
    level["tracks"] = level["tracks"][1:]
    level["appearances"] = []
    with pytest.raises(ValueError, match="剧情关联场景"):
        edit(project, {"type": "put_level", "level": level})
    with pytest.raises(ValueError, match="剧情关联关卡"):
        edit(project, {"type": "delete_level", "level_id": "camp"})


def test_legacy_unscoped_hash_and_global_execution_are_unchanged():
    project = planned()
    old = project.model_dump(mode="json")
    for row in old["content"]["events"] + old["content"]["rules"]:
        row.pop("scope", None)
        row.pop("anchor_id", None)
    restored = Project.model_validate(old)
    assert author_hash(old) == author_hash(restored)
    assert simulate(project, at_tick=10, location_id="gate") == simulate(
        restored, at_tick=10, location_id="gate"
    )


def test_scoped_plot_survives_json_reopen():
    project = with_plot()
    restored = Project.model_validate_json(project.model_dump_json())
    assert restored.content.events[-1] == project.content.events[-1]
    assert (
        simulate(restored, at_tick=0, level_id="camp", location_id="outpost")["state"][
            "characters"
        ]["keeper"]["behavior"]
        == "巡视营地"
    )


def test_scoped_plot_survives_real_file_and_server_restart(tmp_path):
    store = LocalProjects(tmp_path / "data", tmp_path / "projects")
    path = tmp_path / "projects" / "剧情.ludo.json"
    try:
        project = store.add(with_plot())
        store.save(project.project_id, project.revision, str(path))
    finally:
        store.shutdown()
    restarted = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        restored = Project.model_validate(restarted.open_file(str(path))["project"])
        assert restored.content.events[-1].scope.level_id == "camp"
        assert (
            simulate(restored, at_tick=0, level_id="camp", location_id="outpost")["state"][
                "characters"
            ]["keeper"]["behavior"]
            == "巡视营地"
        )
    finally:
        restarted.shutdown()
