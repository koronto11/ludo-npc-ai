"""Managed folders, legacy compatibility, recovery/export isolation and failure safety."""

import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app
from ludo_npc.application.commands import CommandBatch, ProjectConflict
from ludo_npc.domain.models import Project
from ludo_npc.exports import ExportRequest, build_export
from ludo_npc.project_paths import directory_name
from ludo_npc.storage import FileProblem, LocalProjects


def rename(store, project, name):
    return store.apply(project.project_id, CommandBatch.model_validate({
        "expected_revision": project.revision,
        "commands": [{"type": "rename_project", "name": name}],
    }))


@pytest.mark.parametrize("name,expected", [
    ("营地故事", "营地故事"), ("../城镇/故事 ", "-城镇-故事"),
    ("CON", "CON-项目"), ("NUL.world", "NUL.world-项目"), ("...", "未命名项目"),
])
def test_safe_directory_names(name, expected):
    assert directory_name(name) == expected


def test_folder_recovery_restart_and_parent_preference(tmp_path):
    store = LocalProjects(tmp_path / "app")
    p = store.add(Project(name="营地故事"))
    parent = tmp_path / "projects"
    envelope = store.save_in_folder(p.project_id, p.revision, parent, "营地故事.ludo.json")
    root = parent / "营地故事"
    path = root / "营地故事.ludo.json"
    assert envelope["file"]["managed_folder"] and not envelope["file"]["dirty"]
    assert store.settings.project_folder == str(parent)
    assert (root / "exports").is_dir()
    before = path.read_bytes()
    p = rename(store, p, "更新后的故事")
    store.save(p.project_id, p.revision)
    assert (root / "backups/previous.ludo.json").read_bytes() == before
    assert len(list((root / "backups/history").glob("*.json"))) == 1
    assert not Path(str(path) + ".bak").exists()
    assert not Path(str(path) + ".history").exists()
    store.shutdown()
    reopened = LocalProjects(tmp_path / "app")
    try:
        opened = reopened.open_file(str(path))
        assert opened["file"]["managed_folder"]
        restored = reopened.restore(p.project_id, "previous", p.revision)
        assert restored["project"]["name"] == "营地故事"
        assert json.loads((root / "backups/previous.ludo.json").read_text(encoding="utf-8"))["name"] == "更新后的故事"
        assert reopened.settings.project_folder == str(parent)
    finally:
        reopened.shutdown()


def test_legacy_organization_copies_valid_history_and_preserves_original(tmp_path):
    store = LocalProjects(tmp_path / "app")
    p = store.add(Project(name="旧作品"))
    source = tmp_path / "legacy/story.ludo.json"
    store.save(p.project_id, p.revision, str(source))
    p = rename(store, p, "整理后的作品")
    store.save(p.project_id, p.revision)
    original = source.read_bytes()
    backup = Path(str(source) + ".bak").read_bytes()
    count = len(store.recovery_points(p.project_id))
    result = store.save_in_folder(p.project_id, p.revision, tmp_path / "organized", source.name, copy_history=True)
    target = Path(result["file"]["path"])
    assert result["file"]["managed_folder"]
    assert source.read_bytes() == original and target.read_bytes() == original
    assert Path(str(source) + ".bak").read_bytes() == backup
    assert len(store.recovery_points(p.project_id)) == count
    restored = store.restore(p.project_id, "previous", p.revision)
    assert restored["project"]["name"] == "旧作品"
    assert source.read_bytes() == original
    store.shutdown()


def test_folder_conflict_and_copy_failure_keep_binding_and_original(tmp_path, monkeypatch):
    store = LocalProjects(tmp_path / "app")
    p = store.add(Project(name="保留作品"))
    source = tmp_path / "legacy/story.ludo.json"
    store.save(p.project_id, p.revision, str(source))
    p = rename(store, p, "整理作品")
    store.save(p.project_id, p.revision)
    original = source.read_bytes()
    before = store.status(p.project_id)
    existing = tmp_path / "occupied/整理作品"
    existing.mkdir(parents=True)
    marker = existing / "important.txt"
    marker.write_text("user file")
    with pytest.raises(FileProblem, match="已存在"):
        store.save_in_folder(p.project_id, p.revision, existing.parent, source.name, copy_history=True)
    assert marker.read_text() == "user file" and source.read_bytes() == original
    from ludo_npc.storage import atomic_bytes

    def fail(path, *args, **kwargs):
        if "backups" in path.parts:
            raise OSError("fixture backup failure")
        return atomic_bytes(path, *args, **kwargs)

    monkeypatch.setattr("ludo_npc.storage.atomic_bytes", fail)
    with pytest.raises(OSError):
        store.save_in_folder(p.project_id, p.revision, tmp_path / "copy-failure", source.name, copy_history=True)
    assert store.status(p.project_id) == before and source.read_bytes() == original
    assert store.get(p.project_id).revision == p.revision
    store.shutdown()


def test_export_stays_inside_folder_preserves_existing_and_rejects_stale_preview(tmp_path):
    store = LocalProjects(tmp_path / "app")
    p = store.add(Project(name="交付作品"))
    store.save_in_folder(p.project_id, p.revision, tmp_path / "projects", "project.ludo.json")
    request = ExportRequest(expected_revision=p.revision, format="project")
    result = build_export(p, request)
    first = Path(store.save_export(p.project_id, result)["path"])
    original = first.read_bytes()
    second = Path(store.save_export(p.project_id, result)["path"])
    assert first.parent.name == "exports" and second != first
    assert first.read_bytes() == original == second.read_bytes()
    assert json.loads(original)["project_id"] == p.project_id
    p = rename(store, p, "新的交付作品")
    with pytest.raises(ProjectConflict):
        store.save_export(p.project_id, result)
    with pytest.raises(FileProblem, match="外部"):
        store.folder_child(first.parent.parent, "../escape")
    assert len(list(first.parent.glob("*.json"))) == 2
    store.shutdown()


def test_folder_api_and_open_folder_adapter(tmp_path):
    opened = []
    app = create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects", folder_opener=opened.append)
    with TestClient(app) as client:
        client.get("/api/session")
        response = client.post("/api/files/new", json={
            "name": "文件夹作品", "folder": str(tmp_path / "projects"),
            "filename": "文件夹作品.ludo.json", "template": "campfire", "layout": "folder",
        })
        assert response.status_code == 201
        value = response.json()
        identifier = value["project"]["project_id"]
        assert value["file"]["managed_folder"]
        assert Path(value["file"]["path"]).parent == tmp_path / "projects/文件夹作品"
        assert client.post(f"/api/v2/projects/{identifier}/open-folder").status_code == 200
        assert opened == [str(tmp_path / "projects/文件夹作品")]
        exported = client.post(f"/api/v2/projects/{identifier}/export-file", json={
            "expected_revision": value["project"]["revision"], "format": "markdown",
        })
        assert exported.status_code == 200 and Path(exported.json()["path"]).is_file()
        again = client.post("/api/files/new", json={
            "name": "文件夹作品", "folder": str(tmp_path / "projects"),
            "filename": "different.ludo.json", "layout": "folder",
        })
        assert again.status_code == 409
        assert len(client.get("/api/v2/projects").json()) == 1
        flat = client.post("/api/files/new", json={
            "name": "旧API项目", "folder": str(tmp_path / "legacy"), "filename": "legacy.ludo.json",
        }).json()
        legacy_id = flat["project"]["project_id"]
        assert not flat["file"]["managed_folder"]
        organized = client.post(f"/api/v2/projects/{legacy_id}/organize", json={
            "expected_revision": flat["project"]["revision"], "folder": str(tmp_path / "organized"),
        })
        assert organized.status_code == 200 and organized.json()["file"]["managed_folder"]
        assert Path(flat["file"]["path"]).is_file()


def test_entire_folder_is_portable_with_bounded_recovery_history(tmp_path):
    store = LocalProjects(tmp_path / "app")
    p = store.add(Project(name="可携带作品"))
    saved = store.save_in_folder(p.project_id, p.revision, tmp_path / "projects", "project.ludo.json")
    root = Path(saved["file"]["folder"])
    for step in range(24):
        p = rename(store, p, f"修订 {step}")
        store.save(p.project_id, p.revision)
    assert len(list((root / "backups/history").glob("*.json"))) == 20
    store.shutdown()
    destination = tmp_path / "portable-copy"
    shutil.copytree(root, destination)
    reopened = LocalProjects(tmp_path / "another-app")
    try:
        value = reopened.open_file(str(destination / "project.ludo.json"))
        assert value["project"]["name"] == "修订 23" and value["file"]["managed_folder"]
        assert len(reopened.recovery_points(p.project_id)) == 21
        restored = reopened.restore(p.project_id, "previous", p.revision)
        assert restored["project"]["name"] == "修订 22"
        assert json.loads((root / "project.ludo.json").read_text(encoding="utf-8"))["name"] == "修订 23"
        assert not list(destination.rglob("settings.json"))
        assert not list(destination.rglob("credentials.json"))
    finally:
        reopened.shutdown()
