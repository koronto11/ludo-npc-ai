"""Bounded session history of sparse author changes, never generation/play records."""

import copy
import json
from dataclasses import dataclass

from ..domain.models import Project, utc_now
from .commands import CommandError, ProjectConflict

MANUAL = {
    "create_entity",
    "patch_entity",
    "delete_entity",
    "put_relation",
    "delete_relation",
    "put_canvas",
    "move_node",
    "replace_world",
    "rename_project",
    "set_initial_state",
    "put_level",
    "delete_level",
    "put_dialogue_layout",
    "set_character_note",
    "set_level_control_width",
    "set_level_control_order",
    "set_library_order",
}
LABELS = {
    "create_entity": "创建对象",
    "patch_entity": "修改设定",
    "delete_entity": "移除对象",
    "put_relation": "编辑关系",
    "delete_relation": "移除关系",
    "put_canvas": "调整关系画布",
    "move_node": "移动卡片",
    "replace_world": "编辑世界底稿",
    "rename_project": "修改工程名称",
    "set_initial_state": "编辑初始状态",
    "put_level": "编辑关卡安排",
    "delete_level": "移除关卡",
    "put_dialogue_layout": "调整对白画布",
    "set_character_note": "编辑快速备注",
    "set_level_control_width": "调整控件宽度",
    "set_level_control_order": "调整控件排列",
    "set_library_order": "调整资料排列",
}
EXCLUDED = {
    ("content", "drafts"),
    ("content", "generation_history"),
    ("content", "simulation_cases"),
    ("editor", "play_records"),
    ("editor", "deleted_play_records"),
    ("editor", "deleted_generation_entries"),
    ("editor", "legacy_preview"),
}


@dataclass(frozen=True)
class Item:
    identifier: str


@dataclass
class Change:
    path: tuple
    before: object
    after: object
    before_exists: bool = True
    after_exists: bool = True
    before_index: int = 0
    after_index: int = 0


def changes(before, after, path=()):
    if path in EXCLUDED or before == after:
        return []
    if isinstance(before, dict) and isinstance(after, dict):
        result = []
        for key in before.keys() | after.keys():
            if key not in before or key not in after:
                if path + (key,) not in EXCLUDED:
                    result.append(
                        Change(
                            path + (key,),
                            before.get(key),
                            after.get(key),
                            key in before,
                            key in after,
                        )
                    )
            else:
                result.extend(changes(before[key], after[key], path + (key,)))
        return result
    if isinstance(before, list) and isinstance(after, list):
        keyed = all(
            isinstance(row, dict) and isinstance(row.get("id"), str) for row in before + after
        )
        if keyed:
            left = {row["id"]: (i, row) for i, row in enumerate(before)}
            right = {row["id"]: (i, row) for i, row in enumerate(after)}
            shared = left.keys() & right.keys()
            if [r["id"] for r in before if r["id"] in shared] == [
                r["id"] for r in after if r["id"] in shared
            ]:
                result = []
                for key in left.keys() | right.keys():
                    li, lv = left.get(key, (0, None))
                    ri, rv = right.get(key, (0, None))
                    if key not in shared:
                        result.append(
                            Change(path + (Item(key),), lv, rv, key in left, key in right, li, ri)
                        )
                    else:
                        result.extend(changes(lv, rv, path + (Item(key),)))
                return result
    return [Change(path, before, after)]


def read(data, path):
    for key in path:
        if isinstance(key, Item):
            if not isinstance(data, list):
                return False, None
            data = next((row for row in data if row.get("id") == key.identifier), None)
            if data is None:
                return False, None
        elif not isinstance(data, dict) or key not in data:
            return False, None
        else:
            data = data[key]
    return True, data


def restore(data, change, back):
    exists, value = read(data, change.path[:-1])
    if not exists:
        raise CommandError("撤销对象已改变，请使用备份恢复或重新编辑")
    key = change.path[-1]
    target = change.before if back else change.after
    present = change.before_exists if back else change.after_exists
    if isinstance(key, Item):
        index = next((i for i, row in enumerate(value) if row["id"] == key.identifier), None)
        if index is not None:
            value.pop(index)
        if present:
            value.insert(
                min(change.before_index if back else change.after_index, len(value)),
                copy.deepcopy(target),
            )
    elif present:
        value[key] = copy.deepcopy(target)
    else:
        value.pop(key, None)


class SessionHistory:
    def __init__(self, limit=30, max_bytes=8_000_000):
        self.undo = []
        self.redo = []
        self.limit = limit
        self.max_bytes = max_bytes
        self.notice = ""

    def record(self, before, after, batch):
        # Server-generated drafts, adoption and immutable play records keep their own recovery flows.
        if any(cmd.type not in MANUAL for cmd in batch.commands):
            return
        left, right = before.model_dump(mode="json"), after.model_dump(mode="json")
        delta = changes(
            {k: left[k] for k in ("name", "content", "editor")},
            {k: right[k] for k in ("name", "content", "editor")},
        )
        if not delta:
            return
        size = len(
            json.dumps([(d.before, d.after) for d in delta], ensure_ascii=False).encode("utf-8")
        )
        self.redo.clear()
        self.notice = ""
        if size > self.max_bytes:
            self.undo.clear()
            self.notice = "本次修改超过撤销缓存上限，请通过工程备份恢复。"
            return
        label = LABELS[batch.commands[0].type]
        self.undo.append((label, copy.deepcopy(delta), size))
        while len(self.undo) > self.limit or sum(entry[2] for entry in self.undo) > self.max_bytes:
            self.undo.pop(0)

    def status(self):
        return {
            "undo": self.undo[-1][0] if self.undo else None,
            "redo": self.redo[-1][0] if self.redo else None,
            "undo_count": len(self.undo),
            "redo_count": len(self.redo),
            "notice": self.notice,
        }

    def apply(self, project, revision, direction):
        if project.revision != revision:
            raise ProjectConflict(project.revision)
        back = direction == "undo"
        stack, other = (self.undo, self.redo) if back else (self.redo, self.undo)
        if not stack:
            raise CommandError("没有可撤销的编辑" if back else "没有可重做的编辑")
        entry = stack[-1]
        data = project.model_dump(mode="json")
        for delta in entry[1]:
            exists, value = read(data, delta.path)
            expected_exists = delta.after_exists if back else delta.before_exists
            if exists != expected_exists or value != (delta.after if back else delta.before):
                raise CommandError(
                    "该编辑涉及的内容已被后续操作改变，未覆盖当前内容；请重新编辑或使用备份恢复"
                )
        candidate = copy.deepcopy(data)
        # Restore whole inserted rows before restoring fields; each change touches a disjoint subtree.
        ordered = sorted(entry[1], key=lambda d: d.before_index if back else d.after_index)
        for delta in ordered:
            restore(candidate, delta, back)
        content_changed = (
            candidate["content"] != data["content"] or candidate["name"] != data["name"]
        )
        candidate["revision"] += 1
        candidate["content_revision"] += int(content_changed)
        candidate["layout_revision"] += int(candidate["editor"] != data["editor"])
        candidate["metadata"]["updated_at"] = utc_now()
        result = Project.model_validate(candidate)
        stack.pop()
        other.append(entry)
        return result
