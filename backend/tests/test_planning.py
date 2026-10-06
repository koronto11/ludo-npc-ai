"""Cross-view planning references, persistence and executable dialogue scopes."""

from copy import deepcopy

import pytest

from ludo_npc.application.commands import CommandBatch, apply_commands
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.samples import outpost_project
from ludo_npc.simulation import SimulationInput, rehearse
from tests.test_generation import FixtureProvider, setup_client, start, wait_job


def edit(project, *commands):
    return apply_commands(
        project,
        CommandBatch.model_validate(
            {"expected_revision": project.revision, "commands": list(commands)}
        ),
    )


def planned():
    project = outpost_project()
    dialogue = {
        "id": "camp-chat",
        "kind": "dialogue",
        "name": "篝火闲聊",
        "character_id": "keeper",
        "entry_node_id": "opening",
        "nodes": [
            {
                "id": "opening",
                "label": "开场",
                "text": "来暖暖手吧",
                "options": [{"id": "ask-road", "text": "问问路", "target_node_id": "road"}],
            },
            {
                "id": "road",
                "label": "路况",
                "text": "东门的路要小心",
                "effects": [
                    {"op": "set_behavior", "character_id": "keeper", "behavior": "聊起道路"}
                ],
            },
        ],
    }
    level = {
        "id": "camp",
        "name": "营地关卡",
        "axis_mode": "phase",
        "anchors": [
            {"id": "arrival", "name": "进入营地", "tick": 0},
            {"id": "leave", "name": "离开营地", "tick": 10},
        ],
        "tracks": [
            {"id": "fire", "name": "营地篝火", "location_id": "outpost"},
            {"id": "entrance", "name": "东门", "location_id": "gate"},
        ],
        "appearances": [
            {
                "id": "keeper-fire",
                "character_id": "keeper",
                "track_id": "fire",
                "start_tick": 0,
                "end_tick": 10,
                "start_anchor_id": "arrival",
                "end_anchor_id": "leave",
                "dialogue_ids": ["camp-chat"],
            }
        ],
    }
    return edit(
        project,
        {"type": "create_entity", "entity": dialogue},
        {"type": "put_level", "level": level},
    )


def simulate(project, **values):
    return rehearse(
        project, SimulationInput(expected_content_revision=project.content_revision, **values)
    )


def test_old_v2_defaults_do_not_create_levels_or_duplicate_characters():
    old = outpost_project().model_dump(mode="json")
    old["content"].pop("levels")
    old["editor"].pop("dialogue_layouts")
    for case in old["content"]["simulation_cases"]:
        case.pop("level_id", None)
    restored = Project.model_validate(old)
    assert not restored.content.levels and not restored.editor.dialogue_layouts
    assert len(restored.content.characters) == 1


def test_same_character_has_multiple_appearances_without_changing_author_profile():
    p = planned()
    level = p.content.levels[0].model_dump(mode="json")
    original = p.content.characters[0].model_dump()
    level["appearances"].append(
        {
            "id": "keeper-gate",
            "character_id": "keeper",
            "track_id": "entrance",
            "start_tick": 11,
            "end_tick": 15,
        }
    )
    other = deepcopy(level)
    other["id"] = "chapter-two"
    p = edit(p, {"type": "put_level", "level": level}, {"type": "put_level", "level": other})
    assert len(p.content.characters) == 1
    assert p.content.characters[0].model_dump() == original
    assert sum(len(level.appearances) for level in p.content.levels) == 4
    assert Project.model_validate_json(p.model_dump_json()).content.levels == p.content.levels


def test_old_axis_nodes_load_with_neutral_markers():
    old = planned().model_dump(mode="json")
    for kind in ("anchors", "tracks"):
        for node in old["content"]["levels"][0][kind]:
            node.pop("color")
            node.pop("icon")
    restored = Project.model_validate(old).content.levels[0]
    assert all(node.color == "default" and node.icon == "none" for node in restored.anchors)
    assert all(node.color == "default" and node.icon == "none" for node in restored.tracks)


def test_visual_axis_markers_preserve_old_draft_basis_but_timeline_edits_do_not():
    project = planned()
    old = project.model_dump(mode="json")
    for kind in ("anchors", "tracks"):
        for node in old["content"]["levels"][0][kind]:
            node.pop("color")
            node.pop("icon")
    before = author_hash(old)
    level = project.content.levels[0].model_dump(mode="json")
    level["anchors"][0].update(color="red", icon="warning")
    level["tracks"][0].update(color="blue", icon="map")
    changed = edit(project, {"type": "put_level", "level": level})
    assert author_hash(changed) == before
    assert "color" not in old["content"]["levels"][0]["anchors"][0]
    level["anchors"][0]["name"] = "新的剧情阶段"
    changed = edit(changed, {"type": "put_level", "level": level})
    assert author_hash(changed) != before


@pytest.mark.parametrize(
    "kind,field,bad", [("anchors", "color", "neon"), ("tracks", "icon", "<svg>")]
)
def test_unknown_axis_marker_is_rejected_atomically(kind, field, bad):
    project = planned()
    before = project.model_dump()
    level = project.content.levels[0].model_dump(mode="json")
    level[kind][0][field] = bad
    with pytest.raises(ValueError):
        edit(project, {"type": "put_level", "level": level})
    assert project.model_dump() == before


def test_axis_markers_survive_file_reopen_without_changing_bindings_or_rehearsal(client, tmp_path):
    path = tmp_path / "projects" / "markers.ludo.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(planned().model_dump_json(), encoding="utf-8")
    opened = client.post("/api/files/open", json={"path": str(path)})
    assert opened.status_code == 200
    project = Project.model_validate(opened.json()["project"])
    identifier = project.project_id
    expected = simulate(project, level_id="camp", location_id="outpost", at_tick=2)
    level = project.content.levels[0].model_dump(mode="json")
    original_appearances = deepcopy(level["appearances"])
    level["anchors"][0].update(color="purple", icon="star")
    level["tracks"][0].update(color="green", icon="chat")
    response = client.post(
        f"/api/v2/projects/{identifier}/commands",
        json={
            "expected_revision": project.revision,
            "commands": [{"type": "put_level", "level": level}],
        },
    )
    assert response.status_code == 200
    changed = Project.model_validate(response.json())
    result = simulate(changed, level_id="camp", location_id="outpost", at_tick=2)
    assert result["state"] == expected["state"]
    assert (
        client.post(
            f"/api/v2/projects/{identifier}/save", json={"expected_revision": changed.revision}
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/v2/projects/{identifier}/close", json={"discard": False}).status_code
        == 200
    )
    reopened = client.post("/api/files/open", json={"path": str(path)})
    assert reopened.status_code == 200
    restored = reopened.json()["project"]["content"]["levels"][0]
    assert restored["anchors"][0]["color"] == "purple" and restored["anchors"][0]["icon"] == "star"
    assert restored["tracks"][0]["color"] == "green" and restored["tracks"][0]["icon"] == "chat"
    assert restored["appearances"] == original_appearances
    assert restored["anchors"][0]["tick"] == level["anchors"][0]["tick"]
    assert restored["tracks"][0]["location_id"] == level["tracks"][0]["location_id"]


@pytest.mark.parametrize(
    "mutation", ["character", "track", "anchor", "dialogue", "range", "binding", "condition"]
)
def test_invalid_planning_references_are_atomic(mutation):
    p = planned()
    before = p.model_dump()
    level = p.content.levels[0].model_dump(mode="json")
    appearance = level["appearances"][0]
    if mutation == "character":
        appearance["character_id"] = "missing"
    elif mutation == "track":
        appearance["track_id"] = "missing"
    elif mutation == "anchor":
        appearance["start_anchor_id"] = "missing"
    elif mutation == "dialogue":
        appearance["dialogue_ids"] = ["missing"]
    elif mutation == "range":
        appearance["end_tick"] = -1
    elif mutation == "binding":
        appearance["start_tick"] = 1
    else:
        appearance["condition"] = {"op": "knows", "character_id": "keeper", "fact_id": "missing"}
    with pytest.raises(ValueError):
        edit(p, {"type": "put_level", "level": level})
    assert p.model_dump() == before


def test_scene_and_time_gate_player_choices_and_effects_on_server():
    p = planned()
    choice = {"tick": 2, "dialogue_id": "camp-chat", "option_id": "ask-road"}
    valid = simulate(p, level_id="camp", location_id="outpost", at_tick=2, choices=[choice])
    assert valid["state"]["characters"]["keeper"]["behavior"] == "聊起道路"
    assert valid["appearances"][0]["reason"]["passed"]
    wrong_scene = simulate(p, level_id="camp", location_id="gate", at_tick=2, choices=[choice])
    assert wrong_scene["state"]["characters"]["keeper"]["behavior"] != "聊起道路"
    assert any(d["code"] == "appearance_blocked" for d in wrong_scene["diagnostics"])
    late = simulate(p, level_id="camp", location_id="outpost", at_tick=11)
    assert not next(d for d in late["dialogues"] if d["id"] == "camp-chat")["available"]
    generic = simulate(p, location_id="outpost", at_tick=11)
    assert next(d for d in generic["dialogues"] if d["id"] == "camp-chat")["available"]


def test_unassigned_or_condition_blocked_appearance_is_not_available():
    p = planned()
    level = p.content.levels[0].model_dump(mode="json")
    level["appearances"][0]["track_id"] = None
    p = edit(p, {"type": "put_level", "level": level})
    assert not simulate(p, level_id="camp", location_id="outpost", at_tick=2)["appearances"][0][
        "reason"
    ]["passed"]
    level["appearances"][0]["track_id"] = "fire"
    level["appearances"][0]["condition"] = {"op": "time", "comparison": "gte", "value": 5}
    p = edit(p, {"type": "put_level", "level": level})
    assert not simulate(p, level_id="camp", location_id="outpost", at_tick=2)["appearances"][0][
        "reason"
    ]["passed"]
    assert simulate(p, level_id="camp", location_id="outpost", at_tick=5)["appearances"][0][
        "reason"
    ]["passed"]


def test_layout_moves_do_not_stale_drafts_and_deleted_nodes_prune_layout():
    p = planned()
    before = author_hash(p)
    moved = edit(
        p,
        {
            "type": "put_dialogue_layout",
            "dialogue_id": "camp-chat",
            "positions": {"road": {"x": 800, "y": 30}},
        },
    )
    assert moved.content_revision == p.content_revision
    assert moved.layout_revision == p.layout_revision + 1 and author_hash(moved) == before
    graph = next(d for d in moved.content.dialogues if d.id == "camp-chat")
    nodes = [graph.nodes[0].model_dump(mode="json")]
    nodes[0]["options"][0]["target_node_id"] = None
    changed = edit(
        moved,
        {
            "type": "patch_entity",
            "target": {"kind": "dialogue", "id": graph.id},
            "changes": {"nodes": nodes},
        },
    )
    assert changed.editor.dialogue_layouts[graph.id] == {}


def test_level_delete_cannot_orphan_saved_preview():
    p = planned()
    p = edit(
        p,
        {
            "type": "put_simulation_case",
            "case": {
                "id": "camp-preview",
                "name": "场景预演",
                "level_id": "camp",
                "location_id": "outpost",
            },
        },
    )
    with pytest.raises(ValueError, match="预演关卡不存在"):
        edit(p, {"type": "delete_level", "level_id": "camp"})
    p = edit(
        p,
        {"type": "delete_simulation_case", "case_id": "camp-preview"},
        {"type": "delete_level", "level_id": "camp"},
    )
    assert not p.content.levels


@pytest.mark.parametrize("kind", ["text", "dialogue"])
def test_crowd_generation_enforces_scene_range_and_requires_review(tmp_path, kind):
    provider = FixtureProvider()
    client, identifier, _ = setup_client(tmp_path, provider)
    try:
        item = {
            "kind": kind,
            "name": "营地闲聊",
            "character_id": "keeper" if kind == "dialogue" else None,
            "scene_id": "outpost",
            "start_tick": 2,
            "end_tick": 6,
        }
        assert start(client, identifier, [item]).status_code == 202
        job = wait_job(client, identifier)
        assert job["status"] == "awaiting_review"
        p = client.get(f"/api/v2/projects/{identifier}").json()
        draft = next(d for d in p["content"]["drafts"] if d["id"] == job["draft_ids"][0])
        key = "texts" if kind == "text" else "dialogues"
        assert not any(row["id"] == draft["target"]["id"] for row in p["content"][key])
        response = client.post(
            f"/api/v2/projects/{identifier}/commands",
            json={
                "expected_revision": p["revision"],
                "commands": [
                    {
                        "type": "review_draft",
                        "draft_id": draft["id"],
                        "action": "accept",
                        "expected_author_hash": author_hash(p),
                        "values": draft["patch"],
                    }
                ],
            },
        )
        assert response.status_code == 200
        project = Project.model_validate(response.json())
        for tick, location, expected in [
            (2, "outpost", True),
            (6, "outpost", True),
            (7, "outpost", False),
            (2, "gate", False),
        ]:
            result = simulate(project, at_tick=tick, location_id=location)
            values = result["texts" if kind == "text" else "dialogues"]
            assert (
                next(r for r in values if r["id"] == draft["target"]["id"])["available"] is expected
            )
        saved = client.post(
            f"/api/v2/projects/{identifier}/save", json={"expected_revision": project.revision}
        )
        assert saved.status_code == 200
        assert (
            client.post(f"/api/v2/projects/{identifier}/close", json={"discard": False}).status_code
            == 200
        )
        reopened = client.post(
            "/api/files/open", json={"path": str(tmp_path / "projects" / "test.ludo.json")}
        )
        assert reopened.status_code == 200
        assert any(
            row["id"] == draft["target"]["id"] for row in reopened.json()["project"]["content"][key]
        )
    finally:
        client.__exit__(None, None, None)


def test_campfire_template_persists_levels_layouts_and_scene_preview(client, tmp_path):
    created = client.post(
        "/api/files/new",
        json={
            "name": "营地验收",
            "folder": str(tmp_path / "projects"),
            "filename": "camp.ludo.json",
            "template": "campfire",
        },
    )
    assert created.status_code == 201
    p = created.json()["project"]
    identifier = p["project_id"]
    assert len(p["content"]["characters"]) == 6
    assert len(p["content"]["levels"][0]["appearances"]) == 7
    changed = client.post(
        f"/api/v2/projects/{identifier}/commands",
        json={
            "expected_revision": p["revision"],
            "commands": [
                {
                    "type": "put_dialogue_layout",
                    "dialogue_id": "camp-fire-dialogue",
                    "positions": {"greeting": {"x": 310, "y": 80}},
                }
            ],
        },
    )
    assert changed.status_code == 200
    p = changed.json()
    assert (
        client.post(
            f"/api/v2/projects/{identifier}/save", json={"expected_revision": p["revision"]}
        ).status_code
        == 200
    )
    assert (
        client.post(f"/api/v2/projects/{identifier}/close", json={"discard": False}).status_code
        == 200
    )
    restored = client.post(
        "/api/files/open", json={"path": str(tmp_path / "projects" / "camp.ludo.json")}
    ).json()["project"]
    assert restored["content"]["levels"] == p["content"]["levels"]
    assert restored["editor"]["dialogue_layouts"] == p["editor"]["dialogue_layouts"]
    project = Project.model_validate(restored)
    fire = simulate(project, level_id="camp-level", location_id="camp-fire", at_tick=10)
    assert next(d for d in fire["dialogues"] if d["id"] == "camp-fire-dialogue")["available"]
    clinic = simulate(project, level_id="camp-level", location_id="camp-clinic", at_tick=25)
    assert not next(d for d in clinic["dialogues"] if d["id"] == "camp-fire-dialogue")["available"]
    assert next(d for d in clinic["dialogues"] if d["id"] == "camp-clinic-dialogue")["available"]
