from typing import Annotated, Literal

from pydantic import Field, JsonValue, StrictBool, StrictInt, StrictStr

from ..domain.models import (
    COLLECTIONS,
    Canvas,
    Contract,
    ControlWidth,
    DialogueEdgeId,
    DialogueEdgeLayout,
    Draft,
    Entity,
    EntityRef,
    GenerationRecord,
    Id,
    InitialState,
    LegacyPreviewSnapshot,
    Level,
    LevelControlOrder,
    Name,
    PlayRecord,
    Position,
    Project,
    QuickNote,
    Relation,
    Revision,
    SimulationCase,
    World,
    dialogue_edge_ids,
    utc_now,
)


class CreateEntity(Contract):
    type: Literal["create_entity"]
    entity: Entity


class PatchEntity(Contract):
    type: Literal["patch_entity"]
    target: EntityRef
    changes: dict[StrictStr, JsonValue]


class DeleteEntity(Contract):
    type: Literal["delete_entity"]
    target: EntityRef


class PutRelation(Contract):
    type: Literal["put_relation"]
    relation: Relation


class DeleteRelation(Contract):
    type: Literal["delete_relation"]
    relation_id: Id


class PutCanvas(Contract):
    type: Literal["put_canvas"]
    canvas: Canvas


class SetCharacterNote(Contract):
    type: Literal["set_character_note"]
    character_id: Id
    note: QuickNote
    expected_note: QuickNote | None = None


class SetLevelControlWidth(Contract):
    type: Literal["set_level_control_width"]
    level_id: Id
    kind: Literal["group", "event"]
    control_id: Id
    width: ControlWidth


class PutLevel(Contract):
    type: Literal["put_level"]
    level: Level


class SetLevelControlOrder(Contract):
    type: Literal["set_level_control_order"]
    level_id: Id
    order: LevelControlOrder
    expected_order: LevelControlOrder


class DeleteLevel(Contract):
    type: Literal["delete_level"]
    level_id: Id


class PutDialogueLayout(Contract):
    type: Literal["put_dialogue_layout"]
    dialogue_id: Id
    positions: dict[Id, Position]
    edges: dict[DialogueEdgeId, DialogueEdgeLayout] | None = None


class MoveNode(Contract):
    type: Literal["move_node"]
    canvas_id: Id
    target: EntityRef
    position: Position


class ReplaceWorld(Contract):
    type: Literal["replace_world"]
    world: World


class RenameProject(Contract):
    type: Literal["rename_project"]
    name: Name


class SetInitialState(Contract):
    type: Literal["set_initial_state"]
    state: InitialState


class SetLegacyPreview(Contract):
    type: Literal["set_legacy_preview"]
    preview: LegacyPreviewSnapshot


class PutGenerationRecord(Contract):
    type: Literal["put_generation_record"]
    record: GenerationRecord


class PutSimulationCase(Contract):
    type: Literal["put_simulation_case"]
    case: SimulationCase


class DeleteSimulationCase(Contract):
    type: Literal["delete_simulation_case"]
    case_id: Id


class SavePlayRecord(Contract):
    type: Literal["save_play_record"]
    record: PlayRecord


class SetPlayRecordDeleted(Contract):
    type: Literal["set_play_record_deleted"]
    source: Literal["play_record", "simulation_case"]
    record_id: Id
    deleted: StrictBool


class SetGenerationEntryDeleted(Contract):
    type: Literal["set_generation_entry_deleted"]
    source: Literal["draft", "failed_item"]
    record_id: Id
    item_index: Annotated[StrictInt, Field(ge=0, le=9)] | None = None
    deleted: StrictBool


class PutDraft(Contract):
    type: Literal["put_draft"]
    draft: Draft


class ReviewDraft(Contract):
    type: Literal["review_draft"]
    draft_id: Id
    action: Literal["accept", "reject"]
    expected_author_hash: str = ""
    values: dict[StrictStr, JsonValue] = Field(default_factory=dict)


class RebaseDraft(Contract):
    type: Literal["rebase_draft"]
    draft_id: Id
    expected_author_hash: str


Command = Annotated[
    CreateEntity
    | PatchEntity
    | DeleteEntity
    | PutRelation
    | DeleteRelation
    | PutCanvas
    | SetCharacterNote
    | SetLevelControlWidth
    | SetLevelControlOrder
    | PutLevel
    | DeleteLevel
    | PutDialogueLayout
    | MoveNode
    | ReplaceWorld
    | RenameProject
    | SetInitialState
    | SetLegacyPreview
    | PutGenerationRecord
    | PutSimulationCase
    | SavePlayRecord
    | SetPlayRecordDeleted
    | SetGenerationEntryDeleted
    | DeleteSimulationCase
    | PutDraft
    | ReviewDraft
    | RebaseDraft,
    Field(discriminator="type"),
]


class CommandBatch(Contract):
    expected_revision: Revision
    commands: list[Command] = Field(min_length=1, max_length=500)


class ProjectConflict(Exception):
    def __init__(self, current_revision):
        self.current_revision = current_revision
        super().__init__("项目已被修改，请刷新后重试")


class CommandError(ValueError):
    pass


def find(items, identifier, label):
    for item in items:
        if item["id"] == identifier:
            return item
    raise CommandError(f"{label}不存在: {identifier}")


def put(items, value):
    for index, item in enumerate(items):
        if item["id"] == value["id"]:
            items[index] = value
            return
    items.append(value)


def level_control_keys(data, level):
    return (
        {f"appearance:{row['id']}" for row in level["appearances"] if not row.get("npc_group_id")}
        | {f"group:{row['id']}" for row in level["npc_groups"]}
        | {
            f"event:{row['id']}" for row in data["content"]["events"]
            if row.get("scope") and row["scope"]["level_id"] == level["id"]
        }
    )


def apply_commands(project: Project, batch: CommandBatch) -> Project:
    if project.revision != batch.expected_revision:
        raise ProjectConflict(project.revision)
    data = project.model_dump(mode="json")
    before = project.model_dump(mode="json")
    for command in batch.commands:
        if isinstance(command, CreateEntity):
            value = command.entity.model_dump(mode="json")
            data["content"][COLLECTIONS[command.entity.kind]].append(value)
        elif isinstance(command, (PatchEntity, DeleteEntity)):
            items = data["content"][COLLECTIONS[command.target.kind]]
            row = find(items, command.target.id, "对象")
            if isinstance(command, PatchEntity):
                if not command.changes or {"id", "kind"} & command.changes.keys():
                    raise CommandError("修改不能为空，也不能更改稳定 ID 或对象类型")
                routes_changed = (
                    row["kind"] == "dialogue"
                    and "entry_routes" in command.changes
                    and row.get("entry_routes") != command.changes["entry_routes"]
                )
                row.update(command.changes)
                if row["kind"] == "dialogue" and row["id"] in data["editor"]["dialogue_edges"]:
                    layouts = data["editor"]["dialogue_edges"].get(row["id"], {})
                    valid_edges = dialogue_edge_ids(row)
                    data["editor"]["dialogue_edges"][row["id"]] = {
                        key: value
                        for key, value in layouts.items()
                        if key in valid_edges and not (routes_changed and key.startswith("route:"))
                    }
                if row["kind"] == "dialogue" and row["id"] in data["editor"]["dialogue_layouts"]:
                    positions = data["editor"]["dialogue_layouts"].get(row["id"], {})
                    data["editor"]["dialogue_layouts"][row["id"]] = {
                        key: value
                        for key, value in positions.items()
                        if key in {node["id"] for node in row["nodes"]}
                    }
            else:
                items.remove(row)
                if row["kind"] == "dialogue":
                    data["editor"]["dialogue_layouts"].pop(row["id"], None)
                    data["editor"]["dialogue_edges"].pop(row["id"], None)
                if row["kind"] == "character":
                    data["editor"]["character_notes"].pop(row["id"], None)
                for canvas in data["editor"]["canvases"]:
                    canvas["nodes"] = [
                        node
                        for node in canvas["nodes"]
                        if node["entity"] != command.target.model_dump()
                    ]
        elif isinstance(command, PutRelation):
            put(data["content"]["relations"], command.relation.model_dump(mode="json"))
        elif isinstance(command, DeleteRelation):
            items = data["content"]["relations"]
            items.remove(find(items, command.relation_id, "关系"))
            for canvas in data["editor"]["canvases"]:
                canvas["edges"] = [
                    edge for edge in canvas["edges"] if edge["relation_id"] != command.relation_id
                ]
        elif isinstance(command, PutCanvas):
            put(data["editor"]["canvases"], command.canvas.model_dump(mode="json"))
        elif isinstance(command, SetCharacterNote):
            find(data["content"]["characters"], command.character_id, "人物")
            notes = data["editor"]["character_notes"]
            if (
                command.expected_note is not None
                and notes.get(command.character_id, "") != command.expected_note
            ):
                raise CommandError("这份备注已被修改，请重新打开后再编辑")
            if command.note:
                notes[command.character_id] = command.note
            else:
                notes.pop(command.character_id, None)
        elif isinstance(command, SetLevelControlWidth):
            level = find(data["content"]["levels"], command.level_id, "关卡")
            if command.kind == "group":
                find(level["npc_groups"], command.control_id, "NPC 组")
                if command.width < 280:
                    raise CommandError("NPC 组宽度不能小于 280")
            else:
                event = find(data["content"]["events"], command.control_id, "剧情事件")
                if not event.get("scope") or event["scope"]["level_id"] != command.level_id:
                    raise CommandError("剧情事件不属于这个关卡")
            widths = data["editor"]["level_control_widths"].setdefault(
                command.level_id, {"groups": {}, "events": {}}
            )
            widths["groups" if command.kind == "group" else "events"][command.control_id] = (
                command.width
            )
        elif isinstance(command, SetLevelControlOrder):
            level = find(data["content"]["levels"], command.level_id, "关卡")
            current = data["editor"]["level_control_orders"].get(command.level_id, [])
            if current != command.expected_order:
                raise CommandError("控件排列已被其他编辑修改，请重新拖动")
            allowed = level_control_keys(data, level)
            if len(command.order) != len(set(command.order)) or not set(command.order) <= allowed:
                raise CommandError("控件排列包含重复或不属于关卡的控件")
            data["editor"]["level_control_orders"][command.level_id] = list(command.order)
        elif isinstance(command, PutLevel):
            put(data["content"]["levels"], command.level.model_dump(mode="json"))
            anchors = {anchor.id: anchor.tick for anchor in command.level.anchors}
            for event in data["content"]["events"]:
                if (
                    event.get("scope")
                    and event["scope"]["level_id"] == command.level.id
                    and event.get("anchor_id")
                ):
                    if event["anchor_id"] in anchors:
                        event["scheduled_at"] = anchors[event["anchor_id"]]
                    else:
                        event["anchor_id"] = None
        elif isinstance(command, DeleteLevel):
            items = data["content"]["levels"]
            items.remove(find(items, command.level_id, "关卡"))
            data["editor"]["level_control_widths"].pop(command.level_id, None)
            data["editor"]["level_control_orders"].pop(command.level_id, None)
        elif isinstance(command, PutDialogueLayout):
            data["editor"]["dialogue_layouts"][command.dialogue_id] = {
                key: value.model_dump(mode="json") for key, value in command.positions.items()
            }
            if command.edges is not None:
                data["editor"]["dialogue_edges"][command.dialogue_id] = {
                    key: value.model_dump(mode="json") for key, value in command.edges.items()
                }
        elif isinstance(command, MoveNode):
            canvas = find(data["editor"]["canvases"], command.canvas_id, "画布")
            node = next(
                (node for node in canvas["nodes"] if node["entity"] == command.target.model_dump()),
                None,
            )
            if node is None:
                raise CommandError("该对象不在指定画布内")
            node["position"] = command.position.model_dump(mode="json")
        elif isinstance(command, ReplaceWorld):
            data["content"]["world"] = command.world.model_dump(mode="json")
        elif isinstance(command, RenameProject):
            data["name"] = command.name
        elif isinstance(command, SetInitialState):
            data["content"]["initial_state"] = command.state.model_dump(mode="json")
        elif isinstance(command, SetLegacyPreview):
            data["editor"]["legacy_preview"] = command.preview.model_dump(mode="json")
        elif isinstance(command, PutGenerationRecord):
            put(data["content"]["generation_history"], command.record.model_dump(mode="json"))
        elif isinstance(command, PutSimulationCase):
            put(data["content"]["simulation_cases"], command.case.model_dump(mode="json"))
        elif isinstance(command, SavePlayRecord):
            records = data["editor"]["play_records"]
            value = command.record.model_dump(mode="json")
            existing = next((row for row in records if row["id"] == value["id"]), None)
            if existing is not None and existing != value:
                raise CommandError("已保存的试玩记录不能覆盖，请保存为新记录")
            if existing is None:
                records.append(value)
        elif isinstance(command, DeleteSimulationCase):
            items = data["content"]["simulation_cases"]
            items.remove(find(items, command.case_id, "预演分支"))
            data["editor"]["deleted_play_records"] = [
                row
                for row in data["editor"]["deleted_play_records"]
                if not (row["source"] == "simulation_case" and row["record_id"] == command.case_id)
            ]
        elif isinstance(command, SetPlayRecordDeleted):
            records = (
                data["editor"]["play_records"]
                if command.source == "play_record"
                else data["content"]["simulation_cases"]
            )
            find(records, command.record_id, "试玩记录")
            deleted = data["editor"]["deleted_play_records"]
            existing = next(
                (
                    row
                    for row in deleted
                    if row["source"] == command.source and row["record_id"] == command.record_id
                ),
                None,
            )
            if command.deleted and existing is None:
                deleted.append(
                    {
                        "source": command.source,
                        "record_id": command.record_id,
                        "deleted_at": utc_now(),
                    }
                )
            elif not command.deleted and existing is not None:
                deleted.remove(existing)
        elif isinstance(command, SetGenerationEntryDeleted):
            if command.source == "draft":
                find(data["content"]["drafts"], command.record_id, "草稿")
                if command.item_index is not None:
                    raise CommandError("草稿不能附带失败项索引")
            else:
                record = find(data["content"]["generation_history"], command.record_id, "生成记录")
                if record["status"] in {"running", "queued"}:
                    raise CommandError("生成中的任务不能删除失败项")
                index = command.item_index
                items = record["items"]
                if items:
                    if (
                        index is None
                        or not 0 <= index < len(items)
                        or items[index].get("status") != "failed"
                    ):
                        raise CommandError("只能删除真实的失败项")
                elif index != 0 or record["status"] not in {"failed", "interrupted", "cancelled"}:
                    raise CommandError("失败记录不存在")
            deleted = data["editor"]["deleted_generation_entries"]
            key = (command.source, command.record_id, command.item_index)
            existing = next(
                (
                    row
                    for row in deleted
                    if (row["source"], row["record_id"], row["item_index"]) == key
                ),
                None,
            )
            if command.deleted and existing is None:
                deleted.append(
                    {
                        "source": command.source,
                        "record_id": command.record_id,
                        "item_index": command.item_index,
                        "deleted_at": utc_now(),
                    }
                )
            elif not command.deleted and existing is not None:
                deleted.remove(existing)
        elif isinstance(command, PutDraft):
            if command.draft.status != "pending":
                raise CommandError("新增草稿必须等待审核")
            existing = next(
                (row for row in data["content"]["drafts"] if row["id"] == command.draft.id),
                None,
            )
            if existing is not None:
                if existing["status"] != "pending":
                    raise CommandError("已审核草稿不能重新写入，请创建新草稿")
                candidate = command.draft.model_dump(mode="json")
                immutable = (
                    "target",
                    "operation",
                    "basis_hash",
                    "base_values",
                    "base_content_revision",
                    "task_id",
                    "applied_fields",
                    "scene_context",
                )
                if any(existing[key] != candidate[key] for key in immutable):
                    raise CommandError("修改候选不能改变审核目标或基准，请使用重新比较")
            put(data["content"]["drafts"], command.draft.model_dump(mode="json"))
        elif isinstance(command, (ReviewDraft, RebaseDraft)):
            if any(
                row["source"] == "draft" and row["record_id"] == command.draft_id
                for row in data["editor"]["deleted_generation_entries"]
            ):
                raise CommandError("请先恢复已删除的草稿再审核")
            from ..drafts import apply_review, rebase

            if isinstance(command, ReviewDraft):
                from ..drafts import author_hash

                apply_review(data, command, author_hash(before))
            else:
                rebase(data, command.draft_id, command.expected_author_hash)
    # Remove presentation metadata when its control is removed or changes level.
    for level_id, widths in list(data["editor"]["level_control_widths"].items()):
        level = next((row for row in data["content"]["levels"] if row["id"] == level_id), None)
        if level is None:
            del data["editor"]["level_control_widths"][level_id]
            continue
        group_ids = {row["id"] for row in level["npc_groups"]}
        event_ids = {
            row["id"]
            for row in data["content"]["events"]
            if row.get("scope") and row["scope"]["level_id"] == level_id
        }
        widths["groups"] = {
            key: value for key, value in widths["groups"].items() if key in group_ids
        }
        widths["events"] = {
            key: value for key, value in widths["events"].items() if key in event_ids
        }
    for level_id, order in list(data["editor"]["level_control_orders"].items()):
        level = next((row for row in data["content"]["levels"] if row["id"] == level_id), None)
        if level is None:
            del data["editor"]["level_control_orders"][level_id]
        else:
            allowed = level_control_keys(data, level)
            data["editor"]["level_control_orders"][level_id] = [key for key in order if key in allowed]
    for record in data["content"]["generation_history"]:
        if record["status"] == "awaiting_review" and record["draft_ids"]:
            related = [d for d in data["content"]["drafts"] if d["id"] in record["draft_ids"]]
            if related and not any(d["status"] == "pending" for d in related):
                record["status"] = (
                    "applied" if any(d["status"] == "accepted" for d in related) else "completed"
                )
    content_changed = data["content"] != before["content"] or data["name"] != before["name"]
    layout_changed = data["editor"] != before["editor"]
    if not content_changed and not layout_changed:
        return project.model_copy(deep=True)
    data["revision"] += 1
    data["content_revision"] += int(content_changed)
    data["layout_revision"] += int(layout_changed)
    data["metadata"]["updated_at"] = utc_now()
    # Commit only after all commands and cross-references validate as one transaction.
    return Project.model_validate(data)
