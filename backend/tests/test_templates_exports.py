import csv
import io
import json

import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import ProjectConflict
from ludo_npc.application.commands import apply_commands as apply_batch
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.models import Character, Project
from ludo_npc.exports import ExportRequest, build_export
from ludo_npc.storage import FileProblem
from ludo_npc.templates import (
    ApplyTemplate,
    Template,
    TemplateLibrary,
    apply_commands,
    builtin_templates,
    capture,
)


def request(project, template, **kwargs):
    return ApplyTemplate(
        expected_revision=project.revision, template_id=template.id, name="新对象", **kwargs
    )


def test_builtin_recipes_create_valid_independent_objects():
    original = campfire_project()
    baseline = original.model_dump_json()
    for template in builtin_templates():
        args = {} if isinstance(template.payload, Character) else {"character_id": "camp-xialan"}
        batch, identifier = apply_commands(original, template, request(original, template, **args))
        created = apply_batch(original, batch)
        Project.model_validate(created.model_dump())
        assert created.revision == original.revision + 1
        assert identifier not in baseline
    assert original.model_dump_json() == baseline


def test_profile_capture_resets_groups_and_protection_not_story():
    project = campfire_project()
    actor = project.content.characters[0]
    actor.confirmed_fields = ["story"]
    template = capture(project, "character", actor.id, "我的人物")
    assert template.payload.story == actor.story
    assert template.payload.goals == actor.goals
    assert template.payload.tags == []
    assert template.payload.confirmed_fields == []
    assert actor.tags and actor.confirmed_fields == ["story"]


def test_dialogue_recipe_remaps_loops_options_and_follows_specific_visit():
    project = campfire_project()
    g = project.content.dialogues[0]
    g.nodes[-1].options[0].target_node_id = g.entry_node_id
    original = g.model_dump_json()
    template = capture(project, "dialogue", g.id, "诊疗结构")
    assert template.payload.entry_routes == []
    assert "条件" in template.note and "效果" in template.note
    assert all(
        n.condition.op == "always" and not n.effects and n.speaker_id is None
        for n in template.payload.nodes
    )
    batch, identifier = apply_commands(
        project,
        template,
        request(
            project,
            template,
            character_id="camp-xialan",
            level_id="camp-level",
            appearance_id="camp-appearance-xialan",
        ),
    )
    created = apply_batch(project, batch)
    new = next(d for d in created.content.dialogues if d.id == identifier)
    assert not {n.id for n in new.nodes} & {n.id for n in g.nodes}
    assert new.nodes[-1].options[0].target_node_id == new.entry_node_id
    assert all(n.condition.appearance_id == "camp-appearance-xialan" for n in new.nodes)
    appearances = created.content.levels[0].appearances
    assert identifier in appearances[0].dialogue_ids
    assert next(a for a in appearances if a.id == "camp-appearance-xialan-clinic").dialogue_ids == [
        "camp-clinic-dialogue"
    ]
    assert g.model_dump_json() == original


@pytest.mark.parametrize(
    "kwargs",
    [
        {"character_id": "missing"},
        {
            "character_id": "camp-aluo",
            "level_id": "camp-level",
            "appearance_id": "camp-appearance-xialan",
        },
        {"character_id": "camp-xialan", "level_id": "missing", "appearance_id": "missing"},
    ],
)
def test_invalid_template_destination_rejected(kwargs):
    template = builtin_templates()[-1]
    project = campfire_project()
    with pytest.raises(ValueError):
        apply_commands(project, template, request(project, template, **kwargs))


def test_templates_local_reopen_archive_restore_and_conflicts(tmp_path, monkeypatch):
    lib = TemplateLibrary(tmp_path)
    source = campfire_project()
    item = capture(source, "character", "camp-xialan", "药师模板")
    saved = lib.change(1, item=item)
    assert saved["revision"] == 2
    assert TemplateLibrary(tmp_path).get(item.id).payload.story == item.payload.story
    lib.change(2, identifier=item.id, archived=True)
    with pytest.raises(ValueError):
        lib.get(item.id)
    with pytest.raises(ProjectConflict):
        lib.change(2, identifier=item.id, archived=False)
    lib.change(3, identifier=item.id, archived=False)
    before = lib.path.read_bytes()

    def fail(*args, **kwargs):
        raise OSError("disk unavailable")

    monkeypatch.setattr("ludo_npc.templates.atomic_bytes", fail)
    with pytest.raises(FileProblem):
        lib.change(4, identifier=item.id, archived=True)
    assert lib.path.read_bytes() == before
    assert not lib.get(item.id).archived


def test_corrupt_template_file_preserved(tmp_path):
    lib = TemplateLibrary(tmp_path)
    lib.path.write_text("{broken", encoding="utf-8")
    with pytest.raises((ValueError, FileProblem)):
        lib.snapshot()
    assert lib.path.read_text() == "{broken"


def test_template_rejects_hidden_cross_project_conditions():
    project = campfire_project()
    with pytest.raises(ValidationError):
        Template(id="unsafe", name="unsafe", payload=project.content.dialogues[0])


def export(project, format, level=None):
    return build_export(
        project, ExportRequest(expected_revision=project.revision, format=format, level_id=level)
    )


def test_markdown_preserves_author_story_branches_scope_and_effects():
    project = campfire_project()
    data = export(project, "markdown", "camp-level")
    assert "玩家受伤" in data["text"]
    assert project.content.characters[0].story in data["text"]
    assert "条件开场 1" in data["text"] and "进入效果" in data["text"]
    assert "营地篝火" in data["text"] and "医帐" in data["text"]
    assert data["counts"]["dialogues"] == 2
    assert "generation_history" not in data["text"] and "play_records" not in data["text"]
    assert data["filename"].endswith(".md")


def test_csv_roundtrip_preserves_quotes_multiline_conditions_and_jump():
    project = campfire_project()
    g = project.content.dialogues[0]
    g.nodes[0].text = '她说："过来。"\n然后递出绷带，停了一会儿。'
    g.nodes[0].options[0].text = '=HYPERLINK("x")'
    data = export(project, "csv", "camp-level")
    assert data["text"].startswith("\ufeff")
    rows = list(csv.DictReader(io.StringIO(data["text"].lstrip("\ufeff"))))
    node = next(r for r in rows if r["记录类型"] == "对白" and r["节点ID"] == g.nodes[0].id)
    assert node["正文"] == g.nodes[0].text
    option = next(r for r in rows if r["选项ID"] == g.nodes[0].options[0].id)
    assert option["正文"].startswith("'=HYPERLINK")
    assert option["跳转节点ID"] == g.nodes[0].options[0].target_node_id
    assert json.loads(option["条件JSON"]) == g.nodes[0].options[0].condition.model_dump(mode="json")
    assert len([r for r in rows if r["记录类型"] == "条件开场"]) == 1
    assert json.loads(node["出场绑定JSON"])[0]["appearance_id"] == "camp-appearance-xialan"


def test_export_scopes_legacy_links_and_no_mutation():
    project = campfire_project()
    original = project.model_dump_json()
    whole = export(project, "project")
    assert Project.model_validate_json(whole["text"]) == project
    with pytest.raises(ValueError):
        export(project, "project", "camp-level")
    with pytest.raises(ValueError):
        export(project, "csv", "missing")
    with pytest.raises(ProjectConflict):
        build_export(project, ExportRequest(expected_revision=99, format="markdown"))
    assert project.model_dump_json() == original


def test_template_api_and_exports_do_not_touch_provider_or_capture_unsubmitted(client):
    p = client.post("/api/v2/projects", json={"name": "模板验收"}).json()
    library = client.get("/api/templates").json()
    made = client.post(
        f"/api/v2/projects/{p['project_id']}/templates/apply",
        json={
            "expected_revision": p["revision"],
            "template_id": "builtin-merchant",
            "name": "山路商人",
        },
    )
    assert made.status_code == 200
    saved = made.json()["project"]
    old = client.post(
        "/api/templates",
        json={
            "project_id": p["project_id"],
            "expected_revision": p["revision"],
            "library_revision": library["revision"],
            "source_kind": "character",
            "source_id": made.json()["created_id"],
            "name": "商人模板",
        },
    )
    assert old.status_code == 409
    capture_response = client.post(
        "/api/templates",
        json={
            "project_id": p["project_id"],
            "expected_revision": saved["revision"],
            "library_revision": library["revision"],
            "source_kind": "character",
            "source_id": made.json()["created_id"],
            "name": "商人模板",
        },
    )
    assert capture_response.status_code == 200
    assert len(capture_response.json()["items"]) == 7
    data = client.post(
        f"/api/v2/projects/{p['project_id']}/handoff",
        json={"expected_revision": saved["revision"], "format": "markdown"},
    )
    assert data.status_code == 200 and "山路商人" in data.json()["text"]
    assert client.get(f"/api/v2/projects/{p['project_id']}").json() == saved


def test_library_recipe_can_be_applied_in_another_empty_project(client):
    first = client.post("/api/v2/projects", json={"name": "世界一"}).json()
    made = client.post(
        f"/api/v2/projects/{first['project_id']}/templates/apply",
        json={
            "expected_revision": first["revision"],
            "template_id": "builtin-companion",
            "name": "远行同伴",
        },
    ).json()
    template = client.post(
        "/api/templates",
        json={
            "project_id": first["project_id"],
            "expected_revision": made["project"]["revision"],
            "library_revision": 1,
            "source_kind": "character",
            "source_id": made["created_id"],
            "name": "复用同伴",
        },
    ).json()["items"][-1]
    second = client.post("/api/v2/projects", json={"name": "世界二"}).json()
    copied = client.post(
        f"/api/v2/projects/{second['project_id']}/templates/apply",
        json={
            "expected_revision": second["revision"],
            "template_id": template["id"],
            "name": "新的同伴",
        },
    ).json()
    assert copied["created_id"] != made["created_id"]
    assert copied["project"]["content"]["characters"][0]["name"] == "新的同伴"
    assert (
        copied["project"]["content"]["characters"][0]["goals"]
        == made["project"]["content"]["characters"][0]["goals"]
    )
    assert client.get(f"/api/v2/projects/{first['project_id']}").json() == made["project"]


def test_level_export_excludes_other_level_dialogue_and_honors_legacy_links():
    project = campfire_project()
    c = project.content
    second = c.levels[0].model_copy(deep=True)
    second.id = "second-level"
    second.name = "第二关"
    second.appearances = second.appearances[:1]
    second.appearances[0].id = "second-visit"
    second.appearances[0].character_id = "camp-aluo"
    second.appearances[0].dialogue_ids = []
    graph = c.dialogues[0].model_copy(deep=True)
    graph.id = "other-dialogue"
    graph.name = "别的关卡对白"
    graph.character_id = "camp-aluo"
    for node in graph.nodes:
        node.speaker_id = "camp-aluo"
    c.dialogues.append(graph)
    c.levels.append(second)
    # Explicit links isolate the first level from the other actor's general graph.
    for occurrence in c.levels[0].appearances:
        if occurrence.character_id == "camp-aluo":
            occurrence.dialogue_ids = ["camp-fire-dialogue"]
    # Use same-owner general dialogue to satisfy the project relation contract.
    c.levels[0].appearances = [a for a in c.levels[0].appearances if a.character_id != "camp-aluo"]
    project = Project.model_validate(project.model_dump())
    rows = list(
        csv.DictReader(io.StringIO(export(project, "csv", "second-level")["text"].lstrip("\ufeff")))
    )
    assert {r["对白ID"] for r in rows} == {"other-dialogue"}
    assert any(r["所属人物"] == "阿洛" for r in rows)
    bindings = json.loads(rows[0]["出场绑定JSON"])
    assert bindings[0]["scene_name"] == "营地篝火"
    assert "condition" in bindings[0]
    assert export(project, "csv", "camp-level")["counts"]["dialogues"] == 2


def test_markdown_includes_each_character_narrative_role():
    project = campfire_project()
    for actor, importance in zip(project.content.characters, ["key", "supporting", "background"]):
        actor.importance = importance
    text = export(project, "markdown")["text"]
    for label in ["关键角色", "支线角色", "背景角色"]:
        assert "角色定位：" + label in text
