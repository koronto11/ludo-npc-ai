"""Offline portable profile and dialogue-structure recipes, stored locally."""

from threading import RLock
from typing import Literal

from pydantic import Field, model_validator

from .application.commands import CommandBatch, CommandError, ProjectConflict
from .domain.models import Character, Contract, Dialogue, Id, Name, Revision, new_id
from .storage import FileLock, FileProblem, atomic_bytes, read_json


class Template(Contract):
    id: Id
    name: Name
    payload: Character | Dialogue = Field(discriminator="kind")
    archived: bool = False
    note: str = ""

    @model_validator(mode="after")
    def portable(self):
        if isinstance(self.payload, Dialogue):
            g = self.payload
            if (
                g.character_id
                or g.entry_routes
                or any(
                    n.speaker_id
                    or n.condition.op != "always"
                    or n.effects
                    or any(o.condition.op != "always" or o.effects for o in n.options)
                    for n in g.nodes
                )
            ):
                raise ValueError("对白结构模板不能携带原工程的条件、效果或人物引用")
        elif self.payload.confirmed_fields or self.payload.tags:
            raise ValueError("人物模板不携带原分组或字段保护")
        return self


class Library(Contract):
    version: Literal[1] = 1
    revision: Revision = 1
    items: list[Template] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def unique(self):
        if len({i.id for i in self.items}) != len(self.items):
            raise ValueError("模板 ID 重复")
        return self


class CaptureTemplate(Contract):
    project_id: Id
    expected_revision: Revision
    library_revision: Revision
    source_kind: Literal["character", "dialogue"]
    source_id: Id
    name: Name


class ApplyTemplate(Contract):
    expected_revision: Revision
    template_id: Id
    name: Name
    character_id: Id | None = None
    level_id: Id | None = None
    appearance_id: Id | None = None


class ArchiveTemplate(Contract):
    library_revision: Revision
    archived: bool


def capture(project, kind, identifier, name):
    source = next((r for r in getattr(project.content, kind + "s") if r.id == identifier), None)
    if source is None:
        raise CommandError("模板来源已移除，请重新选择")
    payload = source.model_dump(mode="json")
    payload["id"] = "recipe"
    payload["tags"] = []
    if kind == "character":
        payload["confirmed_fields"] = []
        note = "复用人物设定；新人物使用新名称，不继承分组、认知、出场或字段保护。"
        payload = Character.model_validate(payload)
    else:
        conditions = sum(n.condition.op != "always" for n in source.nodes) + sum(
            o.condition.op != "always" for n in source.nodes for o in n.options
        )
        effects = sum(len(n.effects) + sum(len(o.effects) for o in n.options) for n in source.nodes)
        note = f"仅复用正文、选项与跳转。未复制 {conditions} 个条件、{effects} 个效果、{len(source.entry_routes)} 个条件开场；创建后重新配置。"
        payload["character_id"] = None
        payload["entry_routes"] = []
        for n in payload["nodes"]:
            n.update(speaker_id=None, condition={"op": "always"}, effects=[])
            for o in n["options"]:
                o.update(condition={"op": "always"}, effects=[])
        payload = Dialogue.model_validate(payload)
    return Template(id=new_id("template"), name=name, payload=payload, note=note)


def builtin_templates():
    people = [
        (
            "traveler",
            "旅人 / 路人",
            "旅人",
            "带着自己的目的经过场景，可提供日常见闻。",
            "简短自然",
            ["抵达下一处目的地"],
        ),
        (
            "merchant",
            "商人 / 服务者",
            "商人",
            "以交易或服务参与场景，有独立的利益和顾虑。",
            "务实，询问需求",
            ["完成交易", "维护声誉"],
        ),
        (
            "companion",
            "剧情人物 / 同伴",
            "同伴",
            "与主线事件有联系；补充动机、底线和过去的经历。",
            "按人物关系调整亲疏",
            ["待作者定义主线目标"],
        ),
    ]
    items = [
        Template(
            id=f"builtin-{key}",
            name=name,
            payload=Character(
                id="recipe", name=name, role=role, description=desc, voice=voice, goals=goals
            ),
            note="这是可手动修改的起点，不调用模型；不会自动安排出场。",
        )
        for key, name, role, desc, voice, goals in people
    ]
    recipes = [
        (
            "greeting",
            "简短问候",
            [
                {
                    "id": "opening",
                    "label": "开场",
                    "text": "你好，有什么事吗？",
                    "options": [{"id": "leave", "text": "只是打个招呼。"}],
                }
            ],
        ),
        (
            "information",
            "询问信息 / 多话题",
            [
                {
                    "id": "opening",
                    "label": "开场",
                    "text": "你想了解哪方面的事？",
                    "options": [
                        {"id": "ask-a", "text": "这里的情况怎么样？", "target_node_id": "answer-a"},
                        {"id": "ask-b", "text": "你有什么建议？", "target_node_id": "answer-b"},
                        {"id": "leave", "text": "先告辞了。"},
                    ],
                },
                {
                    "id": "answer-a",
                    "label": "话题一",
                    "text": "在这里填写第一条信息。",
                    "options": [
                        {"id": "back-a", "text": "还有别的事。", "target_node_id": "opening"}
                    ],
                },
                {
                    "id": "answer-b",
                    "label": "话题二",
                    "text": "在这里填写第二条信息。",
                    "options": [
                        {"id": "back-b", "text": "还有别的事。", "target_node_id": "opening"}
                    ],
                },
            ],
        ),
        (
            "request",
            "任务请求 / 接受与拒绝",
            [
                {
                    "id": "opening",
                    "label": "提出请求",
                    "text": "我有件事想请你帮忙。",
                    "options": [
                        {"id": "accept", "text": "我愿意帮忙。", "target_node_id": "accepted"},
                        {"id": "decline", "text": "现在不方便。", "target_node_id": "declined"},
                    ],
                },
                {
                    "id": "accepted",
                    "label": "接受",
                    "text": "谢谢你。在这里补充任务详情。",
                    "options": [{"id": "end-a", "text": "我这就出发。"}],
                },
                {
                    "id": "declined",
                    "label": "拒绝",
                    "text": "我理解。如果改变主意，可以再来找我。",
                    "options": [{"id": "end-b", "text": "再见。"}],
                },
            ],
        ),
    ]
    for key, name, nodes in recipes:
        items.append(
            Template(
                id=f"builtin-{key}",
                name=name,
                payload=Dialogue(id="recipe", name=name, entry_node_id="opening", nodes=nodes),
                note="复用对白卡片和跳转；任务状态、选项条件与效果由作者在编排中配置。",
            )
        )
    return items


class TemplateLibrary:
    def __init__(self, data_dir):
        self.path = data_dir / "templates.json"
        self.lock = RLock()

    def read(self):
        return Library.model_validate(read_json(self.path)) if self.path.exists() else Library()

    def snapshot(self):
        with self.lock:
            lib = self.read()
            builtins = [i.model_dump(mode="json") | {"builtin": True} for i in builtin_templates()]
            return {
                "revision": lib.revision,
                "path": str(self.path),
                "items": builtins
                + [i.model_dump(mode="json") | {"builtin": False} for i in lib.items],
            }

    def get(self, identifier):
        with self.lock:
            row = next(
                (
                    i
                    for i in builtin_templates() + self.read().items
                    if i.id == identifier and not i.archived
                ),
                None,
            )
            if row is None:
                raise CommandError("模板已归档或不存在，请刷新模板库")
            return row

    def change(self, expected_revision, *, item=None, identifier=None, archived=False):
        with self.lock:
            disk_lock = FileLock(self.path)
            try:
                lib = self.read()
                if lib.revision != expected_revision:
                    raise ProjectConflict(lib.revision)
                if item:
                    lib.items.append(item)
                else:
                    row = next((i for i in lib.items if i.id == identifier), None)
                    if row is None:
                        raise CommandError("内置模板不可归档，或该模板不存在")
                    row.archived = archived
                lib.revision += 1
                lib = Library.model_validate(lib.model_dump())
                raw = lib.model_dump_json(indent=2).encode("utf-8")
                if len(raw) > 20_000_000:
                    raise FileProblem("本地模板库超过 20 MB 限制")
                try:
                    atomic_bytes(self.path, raw)
                except OSError as exc:
                    raise FileProblem(
                        "模板未保存，原模板库已保留；请检查文件夹权限和可用空间"
                    ) from exc
            finally:
                disk_lock.close()
        return self.snapshot()


def apply_commands(project, template, request):
    payload = template.payload.model_dump(mode="json")
    payload.update(id=new_id(payload["kind"]), name=request.name)
    level = next(
        (level_row for level_row in project.content.levels if level_row.id == request.level_id),
        None,
    )
    appearance = (
        next((a for a in level.appearances if a.id == request.appearance_id), None)
        if level
        else None
    )
    if request.level_id or request.appearance_id:
        if not level or not appearance:
            raise CommandError("请选择有效的人物出场")
    if payload["kind"] == "character":
        if request.character_id or appearance:
            raise CommandError("人物模板用于创建新人物，不覆盖已有档案")
    else:
        actor = next((a for a in project.content.characters if a.id == request.character_id), None)
        if not actor or (appearance and appearance.character_id != actor.id):
            raise CommandError("请选择对白所属人物及其出场")
        ids = {n["id"]: new_id("node") for n in payload["nodes"]}
        payload["character_id"] = actor.id
        payload["entry_node_id"] = ids[payload["entry_node_id"]]
        for n in payload["nodes"]:
            n.update(id=ids[n["id"]], speaker_id=actor.id)
            if appearance:
                n["condition"] = {
                    "op": "appearance",
                    "level_id": level.id,
                    "appearance_id": appearance.id,
                }
            for o in n["options"]:
                o.update(id=new_id("option"), target_node_id=ids.get(o["target_node_id"]))
    commands = [{"type": "create_entity", "entity": payload}]
    if appearance:
        owned = appearance.dialogue_ids or [
            g.id for g in project.content.dialogues if g.character_id == appearance.character_id
        ]
        changed = level.model_dump(mode="json")
        next(a for a in changed["appearances"] if a["id"] == appearance.id)["dialogue_ids"] = [
            *owned,
            payload["id"],
        ]
        commands.append({"type": "put_level", "level": changed})
    return CommandBatch.model_validate(
        {"expected_revision": request.expected_revision, "commands": commands}
    ), payload["id"]
