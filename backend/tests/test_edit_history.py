import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from ludo_npc.api.app import create_app
from ludo_npc.application.commands import CommandBatch, CommandError, ProjectConflict
from ludo_npc.application.history import SessionHistory
from ludo_npc.application.projects import MemoryProjects
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.models import Project
from ludo_npc.storage import LocalProjects


def patch(store, project, **fields):
    return store.apply(
        project.project_id,
        CommandBatch(
            expected_revision=project.revision,
            commands=[
                {
                    "type": "patch_entity",
                    "target": {"kind": "character", "id": "camp-xialan"},
                    "changes": fields,
                }
            ],
        ),
    )


def seeded():
    store = MemoryProjects()
    return store, store.add(campfire_project())


def test_sparse_undo_redo_preserves_later_unrelated_fields_and_records():
    store, original = seeded()
    changed = patch(store, original, story="修改故事", voice="修改口吻")
    # Simulate a subsequent provider record and an unrelated actor change, outside the manual journal.
    data = changed.model_dump(mode="json")
    data["content"]["characters"][1]["story"] = "其他人物后来写的故事"
    data["editor"]["legacy_preview"] = {"day": 3}
    current = Project.model_validate(data)
    store._projects[current.project_id] = current
    undone = store.undo_edit(current.project_id, current.revision, "undo")
    assert undone.content.characters[0].story == original.content.characters[0].story
    assert undone.content.characters[1].story == "其他人物后来写的故事"
    assert undone.editor.legacy_preview == current.editor.legacy_preview
    redone = store.undo_edit(undone.project_id, undone.revision, "redo")
    assert redone.content.characters[0].voice == "修改口吻"
    assert redone.revision > undone.revision > changed.revision


def test_conflict_or_stale_revision_keeps_stack_and_current_data():
    store, project = seeded()
    changed = patch(store, project, story="第一版")
    with pytest.raises(ProjectConflict):
        store.undo_edit(project.project_id, project.revision, "undo")
    data = changed.model_dump(mode="json")
    data["content"]["characters"][0]["story"] = "后来采用的故事"
    store._projects[project.project_id] = Project.model_validate(data)
    before = store.get(project.project_id).model_dump_json()
    with pytest.raises(CommandError, match="后续操作"):
        store.undo_edit(project.project_id, changed.revision, "undo")
    assert store.get(project.project_id).model_dump_json() == before
    assert store.edit_history(project.project_id)["undo_count"] == 1


def test_multicommand_create_with_references_is_undone_atomically():
    store, project = seeded()
    level = project.content.levels[0].model_dump(mode="json")
    level["appearances"].append(
        {
            **level["appearances"][0],
            "id": "new-appearance",
            "character_id": "new-person",
            "dialogue_ids": [],
        }
    )
    changed = store.apply(
        project.project_id,
        CommandBatch(
            expected_revision=project.revision,
            commands=[
                {
                    "type": "create_entity",
                    "entity": {"kind": "character", "id": "new-person", "name": "新人物"},
                },
                {"type": "put_level", "level": level},
            ],
        ),
    )
    undone = store.undo_edit(project.project_id, changed.revision, "undo")
    assert undone.content == project.content
    redone = store.undo_edit(project.project_id, undone.revision, "redo")
    assert redone.content == changed.content


def test_undo_create_rejects_new_external_reference_without_losing_history():
    store, project = seeded()
    changed = store.apply(
        project.project_id,
        CommandBatch(
            expected_revision=project.revision,
            commands=[
                {
                    "type": "create_entity",
                    "entity": {"kind": "character", "id": "new-person", "name": "新人物"},
                }
            ],
        ),
    )
    data = changed.model_dump(mode="json")
    data["content"]["levels"][0]["appearances"].append(
        {
            **data["content"]["levels"][0]["appearances"][0],
            "id": "external",
            "character_id": "new-person",
            "dialogue_ids": [],
        }
    )
    store._projects[project.project_id] = Project.model_validate(data)
    with pytest.raises(ValidationError):
        store.undo_edit(project.project_id, changed.revision, "undo")
    assert store.edit_history(project.project_id)["undo_count"] == 1
    assert len(store.get(project.project_id).content.characters) == 7


def test_delete_restore_retains_list_order_and_redo_branch_clears():
    store, project = seeded()
    # Unreferenced characters can be removed without changing existing appearances.
    extra = [dict(kind="character", id=f"unused-{i}", name=f"闲人{i}") for i in range(3)]
    project = store.apply(
        project.project_id,
        CommandBatch(
            expected_revision=project.revision,
            commands=[{"type": "create_entity", "entity": e} for e in extra],
        ),
    )
    deleted = store.apply(
        project.project_id,
        CommandBatch(
            expected_revision=project.revision,
            commands=[
                {"type": "delete_entity", "target": {"kind": "character", "id": e["id"]}}
                for e in extra[1:]
            ],
        ),
    )
    undone = store.undo_edit(project.project_id, deleted.revision, "undo")
    assert [a.id for a in undone.content.characters] == [a.id for a in project.content.characters]
    next_project = patch(store, undone, voice="新路线")
    assert store.edit_history(project.project_id)["redo_count"] == 0
    assert next_project.content.characters[-1].id == "unused-2"


def test_noop_failed_transaction_and_record_only_changes_do_not_add_history():
    store, project = seeded()
    patch(store, project, story=project.content.characters[0].story)
    assert store.edit_history(project.project_id)["undo_count"] == 0
    with pytest.raises(ValidationError):
        patch(store, project, name="")
    assert store.edit_history(project.project_id)["undo_count"] == 0
    latest = store.apply(
        project.project_id,
        CommandBatch(
            expected_revision=project.revision,
            commands=[
                {
                    "type": "set_legacy_preview",
                    "preview": {"day": 3},
                }
            ],
        ),
    )
    assert latest.editor.legacy_preview.day == 3
    assert store.edit_history(project.project_id)["undo_count"] == 0


def test_cache_bounded_and_layout_only_revision():
    store, project = seeded()
    for i in range(35):
        project = patch(store, project, story=f"故事{i}")
    assert store.edit_history(project.project_id)["undo_count"] == 30
    latest = store.apply(
        project.project_id,
        CommandBatch(
            expected_revision=project.revision,
            commands=[
                {"type": "set_character_note", "character_id": "camp-xialan", "note": "快速记忆"}
            ],
        ),
    )
    undone = store.undo_edit(project.project_id, latest.revision, "undo")
    assert undone.content_revision == latest.content_revision
    assert undone.layout_revision == latest.layout_revision + 1
    history = SessionHistory(max_bytes=1)
    history.record(
        project,
        latest,
        CommandBatch(
            expected_revision=project.revision,
            commands=[
                {"type": "set_character_note", "character_id": "camp-xialan", "note": "快速记忆"}
            ],
        ),
    )
    assert history.status()["notice"] and not history.undo


def test_restore_clears_history_and_undo_saved_file_survives_reopen(tmp_path):
    store = LocalProjects(tmp_path / "app", tmp_path / "projects")
    try:
        project = store.add(campfire_project())
        path = tmp_path / "工程.ludo.json"
        store.save(project.project_id, project.revision, str(path))
        latest = patch(store, project, story="保存故事")
        store.save(project.project_id, latest.revision)
        undone = store.undo_edit(project.project_id, latest.revision, "undo")
        store.save(project.project_id, undone.revision)
        store.close_project(project.project_id)
        reopened = store.open_file(str(path))["project"]
        assert reopened["content"]["characters"][0]["story"] == project.content.characters[0].story
        assert store.edit_history(project.project_id)["undo_count"] == 0
        modified = patch(store, store.get(project.project_id), story="再改一次")
        store.save(project.project_id, modified.revision)
        store.restore(project.project_id, "previous", modified.revision)
        assert not store.edit_history(project.project_id)["undo"]
    finally:
        store.shutdown()


def test_api_history_is_session_protected_and_revision_guarded(tmp_path):
    with TestClient(
        create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects")
    ) as client:
        assert client.get("/api/v2/projects/absent/edit-history").status_code == 401
        client.get("/api/session")
        created = client.post("/api/v2/projects", json={"name": "起点"}).json()
        prefix = f"/api/v2/projects/{created['project_id']}"
        changed = client.post(
            prefix + "/commands",
            json={
                "expected_revision": created["revision"],
                "commands": [{"type": "rename_project", "name": "改名"}],
            },
        ).json()
        assert client.get(prefix + "/edit-history").json()["undo_count"] == 1
        assert (
            client.post(
                prefix + "/edit-history", json={"expected_revision": created["revision"], "direction": "undo"}
            ).status_code
            == 409
        )
        undone = client.post(
            prefix + "/edit-history",
            json={"expected_revision": changed["revision"], "direction": "undo"},
        ).json()
        assert undone["project"]["name"] == "起点"
        assert client.get(prefix + "/edit-history").json()["redo_count"] == 1
