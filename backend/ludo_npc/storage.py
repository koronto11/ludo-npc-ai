"""Single-writer local JSON projects with atomic replacement and recovery copies."""

import hashlib
import json
import os
import tempfile
from contextlib import closing
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Annotated, Literal
from urllib.parse import urlsplit
from uuid import uuid4

from pydantic import Field, StrictBool, StrictInt, model_validator

from .application.commands import ProjectConflict
from .application.projects import MemoryProjects
from .domain.models import Contract, Id, Name, Project, Text, utc_now
from .migration import dump_project, load_document
from .project_paths import directory_name, reserved


class FileProblem(Exception):
    def __init__(self, message, code="file_error"):
        self.code = code
        super().__init__(message)


class ConnectionProfile(Contract):
    endpoint: Text = ""
    model: Name | None = None


class ModelTestResult(Contract):
    status: Literal["success", "failed"]
    checked_at: datetime
    message: Text


class ProviderProfile(ConnectionProfile):
    id: Id
    name: Name
    mode: Literal["remote", "local"] = "remote"
    protocol: Literal["chat_completions"] = "chat_completions"
    stream: StrictBool = False
    json_mode: StrictBool = False
    timeout_seconds: Annotated[StrictInt, Field(ge=5, le=300)] = 90
    max_tokens: Annotated[StrictInt, Field(ge=128, le=16_384)] = 2048
    retry_limit: Annotated[StrictInt, Field(ge=0, le=2)] = 0
    enabled: StrictBool = True
    archived: StrictBool = False
    last_test: ModelTestResult | None = None

    @model_validator(mode="after")
    def valid_connection(self):
        if self.archived and self.enabled:
            raise ValueError("已移除的配置不能启用，请先恢复")
        url = urlsplit(self.endpoint)
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
            or not self.model
        ):
            raise ValueError("填写完整接口地址和模型名；认证信息应放在会话密钥中")
        if url.scheme == "http" and url.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("远程接口使用 HTTPS，本机模型可使用 HTTP")
        return self


class Settings(Contract):
    ui_language: Literal["zh", "en"] = "zh"
    project_folder: str = ""
    recent: list[str] = []
    last_project: str | None = None
    model_profile: ConnectionProfile = ConnectionProfile()
    model_profiles: list[ProviderProfile] = Field(default_factory=list, max_length=30)
    active_profile_id: Id | None = None
    purpose_defaults: dict[Literal["character", "story", "dialogue", "text"], Id] = Field(
        default_factory=dict
    )


class ModelDefaults(Contract):
    active_profile_id: Id | None = None
    purpose_defaults: dict[Literal["character", "story", "dialogue", "text"], Id] = Field(
        default_factory=dict
    )


class WorkspacePreferences(Contract):
    ui_language: Literal["zh", "en"]


def profile_signature(profile):
    return profile.model_dump(exclude={"id", "name", "enabled", "archived", "last_test"})


def default_data_dir():
    root = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / ".local/share")))
    current = root / "NPCs AI Studio"
    legacy = root / "Ludo NPC AI"
    # Keep existing settings/templates together; a rename must not hide user data.
    if not (current / "settings.json").exists() and legacy.is_dir():
        return legacy
    return current


def default_project_dir():
    root = Path.home() / "Documents"
    current = root / "NPCs AI Studio Projects"
    legacy = root / "Ludo Projects"
    return legacy if not current.exists() and legacy.is_dir() else current


def read_json(path):
    def object_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise FileProblem("JSON 存在重复字段，文件未修改")
            result[key] = value
        return result

    def constant(value):
        raise FileProblem("JSON 包含非有限数值，文件未修改")

    if path.stat().st_size > 20_000_000:
        raise FileProblem("项目超过当前 20 MB 文件限制")
    return json.loads(
        path.read_text(encoding="utf-8-sig"),
        object_pairs_hook=object_pairs,
        parse_constant=constant,
    )


def fingerprint(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def atomic_bytes(path, payload, *, exclusive=False):
    """The caller holds a sidecar lock. All temporary files are in the target directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix=".ludo-tmp-", dir=path.parent, delete=False
        ) as stream:
            temporary = Path(stream.name)
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive:
            try:
                os.link(temporary, path)
            except FileExistsError as exc:
                raise FileProblem("目标文件已存在，请换一个名称", "file_exists") from exc
            temporary.unlink()
        else:
            os.replace(temporary, path)
        temporary = None
        if os.name != "nt":
            fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


class FileLock:
    def __init__(self, path):
        self.stream = None
        path.parent.mkdir(parents=True, exist_ok=True)
        stream = (Path(str(path) + ".lock")).open("a+b")
        try:
            if stream.tell() == 0:
                stream.write(b"0")
                stream.flush()
            stream.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.stream = stream
        except OSError as exc:
            stream.close()
            raise FileProblem("项目已由另一个进程打开，请先关闭另一个窗口", "file_busy") from exc

    def close(self):
        if self.stream is not None:
            self.stream.close()
            self.stream = None


class LocalProjects(MemoryProjects):
    def __init__(self, data_dir=None, project_dir=None):
        super().__init__()
        self.data_dir = Path(data_dir or default_data_dir()).resolve()
        self.settings_path = self.data_dir / "settings.json"
        self.settings = Settings(
            project_folder=str(Path(project_dir or default_project_dir()).resolve())
        )
        self.settings_warning = ""
        if self.settings_path.exists():
            try:
                self.settings = Settings.model_validate(read_json(self.settings_path))
            except (OSError, ValueError, FileProblem):
                self.settings_warning = "应用配置无法读取；原文件已保留，暂不更新最近项目"
        self._bindings = {}
        self._disk_lock = RLock()
        # Import here to keep atomic file primitives independent of credentials.
        from .credentials import Credentials

        self.credentials = Credentials(self.data_dir)

    def workspace(self):
        return {
            **self.settings.model_dump(),
            "data_dir": str(self.data_dir),
            "warning": self.settings_warning,
            "credentials": self.credentials.status(self.settings.model_profiles),
        }

    def set_preferences(self, body):
        with self._lock:
            if self.settings_warning:
                raise FileProblem("应用配置存在读取或保存警告，请先处理本地配置文件")
            candidate = self.settings.model_copy(update={"ui_language": body.ui_language})
            atomic_bytes(self.settings_path, candidate.model_dump_json(indent=2).encode("utf-8"))
            self.settings = candidate
            return {"ui_language": self.settings.ui_language}

    def provider_key(self, profile, supplied=""):
        return supplied or self.credentials.get(profile)

    def credential_profile(self, identifier):
        profile = next((p for p in self.settings.model_profiles if p.id == identifier), None)
        if profile is None or profile.archived:
            raise FileProblem("模型配置不存在或已移除")
        return profile

    def _remember(self, path):
        self.settings.last_project = str(path)
        self.settings.recent = [str(path)] + [p for p in self.settings.recent if p != str(path)][
            :19
        ]
        self.settings.project_folder = str(
            path.parent.parent if self.managed_root(path) else path.parent
        )
        self._persist_settings()

    def _persist_settings(self):
        if self.settings_warning:
            return
        try:
            atomic_bytes(
                self.settings_path, self.settings.model_dump_json(indent=2).encode("utf-8")
            )
        except OSError:
            self.settings_warning = "工程文件已保留，但应用偏好写入失败"

    def set_profile(self, profile):
        self.settings.model_profile = profile
        self._persist_settings()
        return self.workspace()

    def set_provider(self, profile):
        with self._lock:
            previous = next((p for p in self.settings.model_profiles if p.id == profile.id), None)
            profile = profile.model_copy(deep=True)
            profile.last_test = (
                previous.last_test
                if previous and profile_signature(previous) == profile_signature(profile)
                else None
            )
            rows = [p for p in self.settings.model_profiles if p.id != profile.id]
            if len(rows) >= 30:
                raise FileProblem("最多保存 30 个模型配置（含已移除配置）")
            candidate = self.settings.model_copy(deep=True)
            candidate.model_profiles = (
                [profile if p.id == profile.id else p for p in candidate.model_profiles]
                if previous
                else [*rows, profile]
            )
            return self._save_model_settings(candidate)

    def _save_model_settings(self, candidate):
        if self.settings_warning:
            raise FileProblem("应用配置存在读取或保存警告，请先处理本地配置文件")
        enabled = {p.id: p for p in candidate.model_profiles if p.enabled and not p.archived}
        if candidate.active_profile_id not in enabled:
            candidate.active_profile_id = next(iter(enabled), None)
        candidate.purpose_defaults = {
            k: v for k, v in candidate.purpose_defaults.items() if v in enabled
        }
        selected = enabled.get(candidate.active_profile_id)
        candidate.model_profile = (
            ConnectionProfile(endpoint=selected.endpoint, model=selected.model)
            if selected
            else ConnectionProfile()
        )
        atomic_bytes(self.settings_path, candidate.model_dump_json(indent=2).encode("utf-8"))
        self.settings = candidate
        return self.workspace()

    def set_model_defaults(self, body):
        with self._lock:
            enabled = {p.id for p in self.settings.model_profiles if p.enabled and not p.archived}
            if (body.active_profile_id and body.active_profile_id not in enabled) or any(
                p not in enabled for p in body.purpose_defaults.values()
            ):
                raise FileProblem("默认模型必须选择已启用的配置")
            if enabled and not body.active_profile_id:
                raise FileProblem("请选择通用默认模型")
            candidate = self.settings.model_copy(deep=True)
            candidate.active_profile_id = body.active_profile_id
            candidate.purpose_defaults = body.purpose_defaults.copy()
            return self._save_model_settings(candidate)

    def archive_provider(self, identifier, restore=False):
        with self._lock:
            profile = next((p for p in self.settings.model_profiles if p.id == identifier), None)
            if profile is None:
                raise FileProblem("模型配置不存在")
            return self.set_provider(
                profile.model_copy(update={"archived": not restore, "enabled": restore})
            )

    def record_model_test(self, profile, status, message):
        with self._lock:
            stored = next((p for p in self.settings.model_profiles if p.id == profile.id), None)
            if (
                not stored
                or stored.archived
                or profile_signature(stored) != profile_signature(profile)
            ):
                return
            candidate = self.settings.model_copy(deep=True)
            row = next(p for p in candidate.model_profiles if p.id == profile.id)
            row.last_test = ModelTestResult(status=status, checked_at=utc_now(), message=message)
            self._save_model_settings(candidate)

    def provider(self, identifier):
        profile = next((p for p in self.settings.model_profiles if p.id == identifier), None)
        if profile is None:
            raise FileProblem("模型配置不存在")
        if not profile.enabled or profile.archived:
            raise FileProblem("模型配置已停用或移除，请启用或选择其他模型")
        return profile.model_copy(deep=True)

    def status(self, identifier):
        project = self.get(identifier)
        binding = self._bindings.get(identifier)
        root = self.managed_root(binding["path"], identifier) if binding else None
        return {
            "path": str(binding["path"]) if binding else None,
            "saved_revision": binding["revision"] if binding else None,
            "dirty": binding is None or project.revision != binding["revision"],
            "warning": self.settings_warning,
            "folder": str(binding["path"].parent) if binding else None,
            "managed_folder": root is not None,
            "exports_dir": str(root / "exports") if root else None,
        }

    def managed_root(self, path, identifier=None):
        marker = path.parent / ".npcs-project.json"
        if marker.is_file():
            try:
                info = read_json(marker)
                if (
                    info.get("format") == "npcs-project-folder-v1"
                    and info.get("file") == path.name
                    and (identifier is None or info.get("project_id") == identifier)
                ):
                    return path.parent
            except (OSError, ValueError, AttributeError, FileProblem):
                pass
        return None

    def folder_child(self, root, relative):
        destination = (root / relative).resolve()
        if not destination.is_relative_to(root):
            raise FileProblem("项目子目录指向了文件夹外部，请检查目录链接", "folder_conflict")
        return destination

    def backup_paths(self, path, identifier):
        root = self.managed_root(path, identifier)
        if root:
            return (
                self.folder_child(root, "backups/previous.ludo.json"),
                self.folder_child(root, "backups/history"),
            )
        return Path(str(path) + ".bak"), Path(str(path) + ".history")

    def save_in_folder(self, identifier, expected_revision, parent, filename, *, copy_history=False):
        """Create an exclusive folder and rebind only after every copied backup is valid."""
        with self._lock, self._disk_lock:
            project = self.get(identifier)
            if project.revision != expected_revision:
                raise ProjectConflict(project.revision)
            if (
                Path(filename).name != filename
                or any(c in filename for c in '\\/:*?"<>|')
                or reserved(filename)
                or not filename.lower().endswith(".ludo.json")
            ):
                raise FileProblem("请填写有效的 .ludo.json 项目文件名")
            source = self._bindings.get(identifier)
            points = []
            if copy_history and source:
                if fingerprint(source["path"]) != source["fingerprint"]:
                    raise FileProblem("原项目文件已被外部修改，请重新打开后整理", "disk_conflict")
                previous, history = self.backup_paths(source["path"], identifier)
                for point in [previous, *sorted(history.glob("*.json"))[-20:]]:
                    try:
                        if point.is_file() and load_document(read_json(point)).project_id == identifier:
                            points.append(("previous" if point == previous else point.name, point.read_bytes()))
                    except (ValueError, FileProblem):
                        continue
            base = Path(parent).expanduser().resolve()
            base.mkdir(parents=True, exist_ok=True)
            root = base / directory_name(project.name)
            try:
                root.mkdir()  # Existing directories, including empty ones, are never reused.
            except FileExistsError as exc:
                raise FileProblem("同名项目文件夹已存在，请更改项目名称或保存位置", "file_exists") from exc
            try:
                (root / "backups/history").mkdir(parents=True)
                (root / "exports").mkdir()
                atomic_bytes(root / ".npcs-project.json", json.dumps({
                    "format": "npcs-project-folder-v1", "project_id": identifier, "file": filename
                }, ensure_ascii=False, indent=2).encode("utf-8"), exclusive=True)
                for point_id, payload in points:
                    target = root / "backups" / (
                        "previous.ludo.json" if point_id == "previous" else f"history/{point_id}"
                    )
                    atomic_bytes(target, payload, exclusive=True)
                return self.save(identifier, expected_revision, str(root / filename))
            except Exception:
                # Preserve partial files for recovery; remove only truly empty
                # directories created above, never recursively delete user data.
                for directory in [root / "exports", root / "backups/history", root / "backups", root]:
                    try:
                        directory.rmdir()
                    except OSError:
                        pass
                raise

    def save_export(self, identifier, result):
        with self._lock, self._disk_lock:
            project = self.get(identifier)
            if project.revision != result["revision"]:
                raise ProjectConflict(project.revision)
            binding = self._bindings.get(identifier)
            root = self.managed_root(binding["path"], identifier) if binding else None
            if root is None:
                raise FileProblem("先将工程整理为项目文件夹，再保存到 exports")
            folder = self.folder_child(root, "exports")
            folder.mkdir(exist_ok=True)
            filename = result["filename"]
            if Path(filename).name != filename:
                raise FileProblem("导出文件名无效")
            if reserved(filename):
                filename = "导出-" + filename
            with closing(FileLock(folder / ".exports")):
                path = folder / filename
                count = 1
                while path.exists():
                    count += 1
                    path = folder / f"{Path(filename).stem}-{count}{Path(filename).suffix}"
                atomic_bytes(path, result["text"].encode("utf-8"), exclusive=True)
            return {"path": str(path), "filename": path.name, "revision": project.revision}

    def envelope(self, project):
        return {"project": project.model_dump(mode="json"), "file": self.status(project.project_id)}

    def open_file(self, filename, discard=False):
        with self._lock, self._disk_lock:
            path = Path(filename).expanduser().resolve()
            if not path.is_file() or path.suffix.lower() != ".json":
                raise FileProblem("请选择已有的 JSON 项目文件")
            for identifier, binding in self._bindings.items():
                if binding["path"] == path:
                    if self.status(identifier)["dirty"] and not discard:
                        raise FileProblem("项目有未保存修改，请先保存或关闭", "unsaved_changes")
                    if fingerprint(path) == binding["fingerprint"] and not discard:
                        return self.envelope(self.get(identifier))
                    if discard:
                        project = load_document(read_json(path))
                        if project.project_id != identifier:
                            raise FileProblem(
                                "外部文件的项目 ID 已改变，请打开为另一个项目", "disk_conflict"
                            )
                        self._projects[identifier] = project
                        self.clear_history(identifier)
                        binding.update(revision=project.revision, fingerprint=fingerprint(path))
                        return self.envelope(project)
                    raise FileProblem(
                        "文件已被外部修改，请选择放弃当前修改后重新打开", "disk_conflict"
                    )
            lock = FileLock(path)
            try:
                source = read_json(path)
                project = load_document(source)
                if project.project_id in self._projects:
                    if self.status(project.project_id)["dirty"] and not discard:
                        raise FileProblem(
                            "同一项目有未保存修改，请先保存或选择放弃", "unsaved_changes"
                        )
                    old_binding = self._bindings.pop(project.project_id, None)
                    if old_binding:
                        old_binding["lock"].close()
                    self._projects[project.project_id] = project
                    self.clear_history(project.project_id)
                else:
                    self.add(project)
                if source.get("schema_version") == 2:
                    self._bindings[project.project_id] = {
                        "path": path,
                        "lock": lock,
                        "revision": project.revision,
                        "fingerprint": fingerprint(path),
                    }
                    lock = None
                    self._remember(path)
                result = self.envelope(project)
                if source.get("version") == 1:
                    result["file"]["migration_source"] = str(path)
                    result["file"]["warning"] = "旧项目已迁移到工作区，请另存为新文件；原文件未修改"
                return result
            finally:
                if lock:
                    lock.close()

    def save(self, identifier, expected_revision, destination=None):
        with self._lock, self._disk_lock:
            project = self.get(identifier)
            if project.revision != expected_revision:
                raise ProjectConflict(project.revision)
            old_binding = self._bindings.get(identifier)
            path = (
                Path(destination).expanduser().resolve()
                if destination
                else old_binding["path"]
                if old_binding
                else None
            )
            if path is None:
                raise FileProblem("首次保存请先选择项目文件", "path_required")
            if not path.name.lower().endswith(".ludo.json"):
                raise FileProblem("保存文件名需要以 .ludo.json 结尾")
            same_file = old_binding is not None and old_binding["path"] == path
            lock = None
            try:
                if same_file:
                    if fingerprint(path) != old_binding["fingerprint"]:
                        raise FileProblem(
                            "文件已被外部修改或删除；请重新打开或另存副本", "disk_conflict"
                        )
                    if project.revision == old_binding["revision"]:
                        return self.envelope(project)
                else:
                    lock = FileLock(path)
                    if path.exists():
                        raise FileProblem("另存为不会覆盖已有文件，请更换名称", "file_exists")
                payload = dump_project(project).encode("utf-8")
                previous = path.read_bytes() if path.exists() else None
                if previous is not None:
                    # Validate recovery data before publishing a backup of it.
                    load_document(read_json(path))
                    backup, history = self.backup_paths(path, identifier)
                    atomic_bytes(backup, previous)
                    atomic_bytes(
                        history / f"{utc_now().strftime('%Y%m%dT%H%M%S%f')}-{uuid4().hex[:8]}.json",
                        previous,
                    )
                atomic_bytes(path, payload, exclusive=not same_file)
                if not same_file and old_binding:
                    old_binding["lock"].close()
                self._bindings[identifier] = {
                    "path": path,
                    "lock": old_binding["lock"] if same_file else lock,
                    "revision": project.revision,
                    "fingerprint": hashlib.sha256(payload).hexdigest(),
                }
                lock = None
                self._remember(path)
                _, history = self.backup_paths(path, identifier)
                if history.exists():
                    for obsolete in sorted(history.glob("*.json"))[:-20]:
                        try:
                            obsolete.unlink()
                        except OSError:
                            pass
                return self.envelope(project)
            finally:
                if lock:
                    lock.close()

    def recovery_points(self, identifier):
        self.get(identifier)
        binding = self._bindings.get(identifier)
        if not binding:
            return []
        path = binding["path"]
        previous, history = self.backup_paths(path, identifier)
        candidates = [previous] + sorted(history.glob("*.json"), reverse=True)
        result = []
        for candidate in candidates:
            if candidate.is_file():
                try:
                    project = load_document(read_json(candidate))
                    if project.project_id != identifier:
                        continue
                    result.append(
                        {
                            "id": "previous" if candidate == previous else candidate.name,
                            "name": project.name,
                            "revision": project.revision,
                            "updated_at": project.metadata.updated_at.isoformat(),
                        }
                    )
                except (ValueError, OSError, FileProblem):
                    continue
        return result

    def restore(self, identifier, point_id, expected_revision):
        with self._lock, self._disk_lock:
            current = self.get(identifier)
            if current.revision != expected_revision:
                raise ProjectConflict(current.revision)
            binding = self._bindings.get(identifier)
            points = {row["id"] for row in self.recovery_points(identifier)}
            if not binding or point_id not in points:
                raise FileProblem("恢复点不存在或已失效")
            path = binding["path"]
            previous, history = self.backup_paths(path, identifier)
            source = previous if point_id == "previous" else history / point_id
            restored = load_document(read_json(source)).model_dump()
            restored.update(
                revision=current.revision + 1,
                content_revision=current.content_revision + 1,
                layout_revision=current.layout_revision + 1,
            )
            restored["metadata"]["updated_at"] = utc_now()
            candidate = Project.model_validate(restored)
            self._projects[identifier] = candidate
            try:
                result = self.save(identifier, candidate.revision)
                self.clear_history(identifier)
                return result
            except Exception:
                self._projects[identifier] = current
                raise

    def close_project(self, identifier, discard=False):
        with self._lock, self._disk_lock:
            if self.status(identifier)["dirty"] and not discard:
                raise FileProblem("请先保存修改，或明确选择放弃当前修改", "unsaved_changes")
            binding = self._bindings.pop(identifier, None)
            if binding:
                binding["lock"].close()
            self._projects.pop(identifier)
            self._histories.pop(identifier, None)

    def shutdown(self):
        for binding in self._bindings.values():
            binding["lock"].close()
        self._bindings.clear()
