import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from ludo_npc.api.app import create_app
from ludo_npc.application.commands import CommandBatch
from ludo_npc.domain.models import Project
from ludo_npc.storage import FileProblem, LocalProjects, atomic_bytes


def rename(store, project, name):
    return store.apply(
        project.project_id,
        CommandBatch(
            expected_revision=project.revision, commands=[{"type": "rename_project", "name": name}]
        ),
    )


@pytest.fixture
def store(tmp_path):
    store = LocalProjects(tmp_path / "app", tmp_path / "projects")
    yield store
    store.shutdown()


def save_blank(store, tmp_path):
    project = store.add(Project(name="起点"))
    path = tmp_path / "用户项目" / "世界.ludo.json"
    store.save(project.project_id, project.revision, str(path))
    return project, path


def test_save_restart_open_content_and_layout(store, tmp_path, document):
    project = store.add(Project.model_validate(document))
    path = tmp_path / "用户项目" / "驿站.ludo.json"
    store.save(project.project_id, project.revision, str(path))
    store.shutdown()
    restarted = LocalProjects(store.data_dir)
    try:
        result = restarted.open_file(str(path))
        assert result["project"] == document
        assert result["file"]["dirty"] is False
        assert restarted.workspace()["last_project"] == str(path.resolve())
    finally:
        restarted.shutdown()


def test_recovery_and_save_as_preserve_original(store, tmp_path):
    project, path = save_blank(store, tmp_path)
    old = path.read_bytes()
    edited = rename(store, project, "更新后")
    assert store.status(project.project_id)["dirty"]
    store.save(project.project_id, edited.revision)
    assert Path(str(path) + ".bak").read_bytes() == old
    assert store.recovery_points(project.project_id)[0]["id"] == "previous"
    recovered = store.restore(project.project_id, "previous", edited.revision)
    assert recovered["project"]["name"] == "起点"
    assert recovered["project"]["revision"] == 3
    original = path.read_bytes()
    copy = tmp_path / "副本.ludo.json"
    store.save(project.project_id, 3, str(copy))
    assert path.read_bytes() == original
    assert store.status(project.project_id)["path"] == str(copy.resolve())
    with pytest.raises(FileProblem, match="不会覆盖"):
        store.save(project.project_id, 3, str(path))
    assert path.read_bytes() == original
    # Switching between an original and its save-as copy is allowed after validation.
    reopened = store.open_file(str(path))
    assert reopened["file"]["path"] == str(path.resolve())


@pytest.mark.parametrize("failure", ["temp", "replace"])
def test_write_failure_keeps_original_and_unsaved_edits(store, tmp_path, monkeypatch, failure):
    project, path = save_blank(store, tmp_path)
    old = path.read_bytes()
    edited = rename(store, project, "等待保存")
    if failure == "temp":
        monkeypatch.setattr(
            "ludo_npc.storage.tempfile.NamedTemporaryFile",
            lambda **kw: (_ for _ in ()).throw(PermissionError("denied")),
        )
    else:
        replace = os.replace

        def failed_replace(source, target):
            if Path(target) == path:
                raise OSError("disk error")
            return replace(source, target)

        monkeypatch.setattr("ludo_npc.storage.os.replace", failed_replace)
    with pytest.raises(OSError):
        store.save(project.project_id, edited.revision)
    assert path.read_bytes() == old
    assert store.get(project.project_id).name == "等待保存"
    assert store.status(project.project_id)["dirty"]
    assert not list(path.parent.glob(".ludo-tmp-*"))


def test_external_modification_is_not_overwritten(store, tmp_path):
    project, path = save_blank(store, tmp_path)
    edited = rename(store, project, "本窗口")
    disk = json.loads(path.read_text(encoding="utf-8"))
    disk["name"] = "外部修改"
    path.write_text(json.dumps(disk), encoding="utf-8")
    changed = path.read_bytes()
    with pytest.raises(FileProblem, match="外部修改"):
        store.save(project.project_id, edited.revision)
    assert path.read_bytes() == changed
    with pytest.raises(FileProblem):
        store.open_file(str(path))
    assert store.open_file(str(path), discard=True)["project"]["name"] == "外部修改"


def test_os_lock_blocks_another_store_and_releases_on_close(store, tmp_path):
    project, path = save_blank(store, tmp_path)
    another = LocalProjects(tmp_path / "other-app")
    try:
        with pytest.raises(FileProblem) as caught:
            another.open_file(str(path))
        assert caught.value.code == "file_busy"
        store.close_project(project.project_id)
        assert another.open_file(str(path))["project"]["name"] == "起点"
    finally:
        another.shutdown()


def test_crash_before_and_after_replace_reopens_valid_file(store, tmp_path):
    project, path = save_blank(store, tmp_path)
    store.shutdown()
    for phase in ("before", "after"):
        code = """import os,sys
from pathlib import Path
from ludo_npc.storage import LocalProjects
from ludo_npc.application.commands import CommandBatch
store=LocalProjects(sys.argv[1])
result=store.open_file(sys.argv[2]); p=store.get(result['project']['project_id'])
edited=store.apply(p.project_id,CommandBatch(expected_revision=p.revision,commands=[{'type':'rename_project','name':'崩溃后版本'}]))
replace=os.replace
def crash(source,target):
 if Path(target)==Path(sys.argv[2]):
  if sys.argv[3]=='after': replace(source,target)
  os._exit(71)
 return replace(source,target)
os.replace=crash
store.save(p.project_id,edited.revision)
"""
        process = subprocess.run(
            [sys.executable, "-c", code, str(store.data_dir), str(path), phase],
            capture_output=True,
            timeout=10,
        )
        assert process.returncode == 71, process.stderr
        reopened = LocalProjects(store.data_dir)
        try:
            result = reopened.open_file(str(path))
            assert result["project"]["name"] == ("起点" if phase == "before" else "崩溃后版本")
        finally:
            reopened.shutdown()


def test_v1_migration_never_overwrites_source(store, tmp_path, legacy):
    source = tmp_path / "old.json"
    source.write_text(json.dumps(legacy), encoding="utf-8")
    original = source.read_bytes()
    result = store.open_file(str(source))
    assert result["file"]["path"] is None
    with pytest.raises(FileProblem):
        store.save(result["project"]["project_id"], 1, str(source))
    assert source.read_bytes() == original


def test_corrupt_backup_and_path_traversal_restore_are_rejected(store, tmp_path):
    project, path = save_blank(store, tmp_path)
    Path(str(path) + ".bak").write_text("not json", encoding="utf-8")
    assert not store.recovery_points(project.project_id)
    with pytest.raises(FileProblem):
        store.restore(project.project_id, "../../outside.json", 1)


def test_unsaved_close_requires_explicit_discard(store, tmp_path):
    project, path = save_blank(store, tmp_path)
    rename(store, project, "未保存")
    with pytest.raises(FileProblem) as caught:
        store.close_project(project.project_id)
    assert caught.value.code == "unsaved_changes"
    store.close_project(project.project_id, discard=True)
    assert json.loads(path.read_text(encoding="utf-8"))["name"] == "起点"


def test_profile_credentials_not_accepted_or_written(store, tmp_path):
    from ludo_npc.storage import ConnectionProfile

    with pytest.raises(ValidationError):
        ConnectionProfile(endpoint="https://example.com/v1", api_key="secret")
    store.set_profile(ConnectionProfile(endpoint="https://example.com/v1", model="my-model"))
    settings = json.loads(store.settings_path.read_text(encoding="utf-8"))
    assert settings["model_profile"] == {"endpoint": "https://example.com/v1", "model": "my-model"}
    assert "api_key" not in store.settings_path.read_text(encoding="utf-8")


def test_exclusive_publish_cannot_overwrite_a_racing_external_file(tmp_path, monkeypatch):
    path = tmp_path / "new.ludo.json"
    link = os.link

    def race(source, destination):
        Path(destination).write_bytes(b"external-file")
        return link(source, destination)

    monkeypatch.setattr("ludo_npc.storage.os.link", race)
    with pytest.raises(FileProblem) as caught:
        atomic_bytes(path, b"author-file", exclusive=True)
    assert caught.value.code == "file_exists"
    assert path.read_bytes() == b"external-file"
    assert not list(tmp_path.glob(".ludo-tmp-*"))


def test_disk_api_picker_cancel_and_restart(tmp_path):
    data_dir = tmp_path / "app"
    file = tmp_path / "user" / "测试.ludo.json"
    with TestClient(
        create_app(
            data_dir=data_dir, project_dir=file.parent, dialog_provider=lambda kind, folder: None
        )
    ) as client:
        client.get("/api/session")
        assert client.post("/api/files/dialog", json={"kind": "folder"}).json() == {"path": None}
        response = client.post(
            "/api/files/new",
            json={
                "name": "测试项目",
                "folder": str(file.parent),
                "filename": file.name,
                "template": "outpost",
            },
        )
        assert response.status_code == 201
        result = response.json()
        identifier = result["project"]["project_id"]
        assert result["file"]["dirty"] is False
        assert (
            client.post(
                "/api/files/new",
                json={"name": "拒绝覆盖", "folder": str(file.parent), "filename": file.name},
            ).status_code
            == 409
        )
        assert (
            client.post(
                "/api/files/new",
                json={
                    "name": "无效路径",
                    "folder": str(file.parent),
                    "filename": "../bad.ludo.json",
                },
            ).status_code
            == 422
        )
        assert client.get(f"/api/v2/projects/{identifier}/file").json()["path"] == str(
            file.resolve()
        )
    with TestClient(create_app(data_dir=data_dir)) as restarted:
        restarted.get("/api/session")
        path = restarted.get("/api/workspace").json()["last_project"]
        assert (
            restarted.post("/api/files/open", json={"path": path}).json()["project"]["name"]
            == "测试项目"
        )
