from typing import Annotated, Literal

from pydantic import Field, JsonValue, StrictStr

from ..domain.models import (
    COLLECTIONS,
    Canvas,
    Contract,
    Draft,
    Entity,
    EntityRef,
    GenerationRecord,
    Id,
    InitialState,
    LegacyPreviewSnapshot,
    Name,
    Position,
    Project,
    Relation,
    Revision,
    SimulationCase,
    World,
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
    | MoveNode
    | ReplaceWorld
    | RenameProject
    | SetInitialState
    | SetLegacyPreview
    | PutGenerationRecord
    | PutSimulationCase
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
                row.update(command.changes)
            else:
                items.remove(row)
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
        elif isinstance(command, DeleteSimulationCase):
            items = data["content"]["simulation_cases"]
            items.remove(find(items, command.case_id, "预演分支"))
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
                )
                if any(existing[key] != candidate[key] for key in immutable):
                    raise CommandError("修改候选不能改变审核目标或基准，请使用重新比较")
            put(data["content"]["drafts"], command.draft.model_dump(mode="json"))
        elif isinstance(command, (ReviewDraft, RebaseDraft)):
            from ..drafts import apply_review, rebase

            if isinstance(command, ReviewDraft):
                from ..drafts import author_hash

                apply_review(data, command, author_hash(before))
            else:
                rebase(data, command.draft_id, command.expected_author_hash)
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
