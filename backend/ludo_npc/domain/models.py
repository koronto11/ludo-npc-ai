"""Authoring contracts shared by the deterministic rehearsal engine.

The complete project is validated at every boundary. Character definitions,
initial state, rehearsal inputs, generated drafts and editor layout are distinct.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    StringConstraints,
    field_validator,
    model_validator,
)

Id = Annotated[StrictStr, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$")]
Name = Annotated[StrictStr, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
Text = Annotated[StrictStr, StringConstraints(max_length=30_000)]
Tick = Annotated[StrictInt, Field(ge=0)]
Revision = Annotated[StrictInt, Field(ge=1)]
Scalar = StrictBool | StrictInt | StrictFloat | StrictStr
EntityKind = Literal[
    "character", "location", "faction", "fact", "variable", "event", "rule", "dialogue", "text"
]
Comparison = Literal["eq", "ne", "gt", "gte", "lt", "lte"]


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


def utc_now() -> datetime:
    return datetime.now(UTC)


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_default=True, allow_inf_nan=False)


class EntityRef(Contract):
    kind: EntityKind
    id: Id


class Named(Contract):
    id: Id
    name: Name
    description: Text = ""
    tags: list[Name] = Field(default_factory=list, max_length=100)


class World(Contract):
    name: Name = "未命名世界"
    district: Text = ""
    premise: Text = ""
    rules: list[Text] = Field(default_factory=list, max_length=500)
    tone: Text = ""
    clock_unit: Literal["minute", "day", "chapter"] = "day"


class Character(Named):
    kind: Literal["character"] = "character"
    role: Text = ""
    importance: Literal["key", "supporting", "background"] = "supporting"
    goals: list[Text] = Field(default_factory=list, max_length=100)
    boundary: Text = ""
    personality: list[Text] = Field(default_factory=list, max_length=100)
    voice: Text = ""
    story: Text = ""
    uncertainties: list[Text] = Field(default_factory=list, max_length=100)
    confirmed_fields: list[Name] = Field(default_factory=list, max_length=30)


class Location(Named):
    kind: Literal["location"] = "location"
    role: Text = ""
    parent_id: Id | None = None


class Faction(Named):
    kind: Literal["faction"] = "faction"
    role: Text = ""
    policies: list[Text] = Field(default_factory=list, max_length=100)


class Fact(Named):
    kind: Literal["fact"] = "fact"
    truth: Literal["true", "false", "unknown"] = "true"
    available_at: Tick = 0
    visibility: Literal["public", "private"] = "private"


class Variable(Named):
    kind: Literal["variable"] = "variable"
    value_type: Literal["boolean", "number", "text"]
    default: Scalar

    @model_validator(mode="after")
    def value_matches_type(self):
        if not value_matches(self.value_type, self.default):
            raise ValueError("变量默认值与声明类型不一致")
        return self


def value_matches(value_type: str, value: Scalar) -> bool:
    return {
        "boolean": type(value) is bool,
        "number": type(value) in (int, float),
        "text": type(value) is str,
    }[value_type]


class Always(Contract):
    op: Literal["always"] = "always"


class ConditionGroup(Contract):
    op: Literal["all", "any"]
    conditions: list[Condition] = Field(min_length=1, max_length=64)


class ConditionNot(Contract):
    op: Literal["not"]
    condition: Condition


class VariableCondition(Contract):
    op: Literal["variable"]
    variable_id: Id
    comparison: Comparison = "eq"
    value: Scalar


class EventCondition(Contract):
    op: Literal["event_occurred"]
    event_id: Id


class KnowledgeCondition(Contract):
    op: Literal["knows"]
    character_id: Id
    fact_id: Id


class LocationCondition(Contract):
    op: Literal["at_location"]
    character_id: Id
    location_id: Id


class SceneCondition(Contract):
    op: Literal["scene"]
    location_id: Id


class TimeCondition(Contract):
    op: Literal["time"]
    comparison: Comparison = "gte"
    value: Tick


Condition = Annotated[
    Always
    | ConditionGroup
    | ConditionNot
    | VariableCondition
    | EventCondition
    | KnowledgeCondition
    | LocationCondition
    | TimeCondition
    | SceneCondition,
    Field(discriminator="op"),
]
ConditionGroup.model_rebuild()
ConditionNot.model_rebuild()


class SetVariable(Contract):
    op: Literal["set_variable"]
    variable_id: Id
    value: Scalar


class IncrementVariable(Contract):
    op: Literal["increment_variable"]
    variable_id: Id
    amount: StrictInt | StrictFloat


class GrantKnowledge(Contract):
    op: Literal["grant_knowledge"]
    character_id: Id
    fact_id: Id


class MoveCharacter(Contract):
    op: Literal["move_character"]
    character_id: Id
    location_id: Id


class SetBehavior(Contract):
    op: Literal["set_behavior"]
    character_id: Id
    behavior: Text


class UnlockText(Contract):
    op: Literal["unlock_text"]
    text_id: Id


Effect = Annotated[
    SetVariable | IncrementVariable | GrantKnowledge | MoveCharacter | SetBehavior | UnlockText,
    Field(discriminator="op"),
]


class Event(Named):
    kind: Literal["event"] = "event"
    scheduled_at: Tick
    enabled: StrictBool = True
    priority: StrictInt = 0
    condition: Condition = Field(default_factory=Always)
    effects: list[Effect] = Field(default_factory=list, max_length=500)
    affected_character_ids: list[Id] = Field(default_factory=list, max_length=1000)
    trigger_policy: Literal["once"] = "once"


class Rule(Named):
    kind: Literal["rule"] = "rule"
    enabled: StrictBool = True
    condition: Condition
    effects: list[Effect] = Field(min_length=1, max_length=500)


class DialogueOption(Contract):
    id: Id
    text: Text
    condition: Condition = Field(default_factory=Always)
    effects: list[Effect] = Field(default_factory=list, max_length=100)
    target_node_id: Id | None = None


class DialogueNode(Contract):
    id: Id
    label: Text = ""
    speaker_id: Id | None = None
    text: Text
    condition: Condition = Field(default_factory=Always)
    effects: list[Effect] = Field(default_factory=list, max_length=100)
    options: list[DialogueOption] = Field(default_factory=list, max_length=100)


class DialogueEntry(Contract):
    node_id: Id
    condition: Condition


class Dialogue(Named):
    kind: Literal["dialogue"] = "dialogue"
    character_id: Id | None = None
    entry_node_id: Id
    entry_routes: list[DialogueEntry] = Field(default_factory=list, max_length=100)
    nodes: list[DialogueNode] = Field(min_length=1, max_length=10_000)


class StoryText(Named):
    kind: Literal["text"] = "text"
    text_type: Literal["letter", "diary", "rumor", "biography", "quest", "custom"] = "custom"
    body: Text
    author_id: Id | None = None
    condition: Condition = Field(default_factory=Always)


Entity = Annotated[
    Character | Location | Faction | Fact | Variable | Event | Rule | Dialogue | StoryText,
    Field(discriminator="kind"),
]
COLLECTIONS = {
    "character": "characters",
    "location": "locations",
    "faction": "factions",
    "fact": "facts",
    "variable": "variables",
    "event": "events",
    "rule": "rules",
    "dialogue": "dialogues",
    "text": "texts",
}
ENTITY_MODELS = {
    "character": Character,
    "location": Location,
    "faction": Faction,
    "fact": Fact,
    "variable": Variable,
    "event": Event,
    "rule": Rule,
    "dialogue": Dialogue,
    "text": StoryText,
}


class Relation(Contract):
    id: Id
    source: EntityRef
    target: EntityRef
    label: Text
    category: Literal["social", "story", "dialogue"] = "social"


class CharacterState(Contract):
    location_id: Id | None = None
    behavior: Text = ""
    known_fact_ids: list[Id] = Field(default_factory=list, max_length=5000)


class InitialState(Contract):
    tick: Tick = 0
    variables: dict[Id, Scalar] = Field(default_factory=dict)
    characters: dict[Id, CharacterState] = Field(default_factory=dict)


class ChoiceRecord(Contract):
    tick: Tick
    dialogue_id: Id
    option_id: Id | None = None
    action: Literal["choice", "start", "restart"] = "choice"
    record_id: Id | None = None
    sequence: Annotated[StrictInt, Field(ge=0)] | None = None

    @model_validator(mode="after")
    def action_matches_option(self):
        if (self.action == "choice") != (self.option_id is not None):
            raise ValueError("选择需提供选项，开始/重开对话不填写选项")
        return self


class SceneRecord(Contract):
    sequence: Annotated[StrictInt, Field(ge=0)] | None = None
    tick: Tick
    location_id: Id | None = None


class SimulationCase(Named):
    at_tick: Tick = 0
    location_id: Id | None = None
    variable_overrides: dict[Id, Scalar] = Field(default_factory=dict)
    choices: list[ChoiceRecord] = Field(default_factory=list, max_length=10_000)
    scene_changes: list[SceneRecord] = Field(default_factory=list, max_length=1000)
    seed: StrictInt = 0
    notes: Text = ""


class Draft(Named):
    target: EntityRef
    operation: Literal["update", "create"] = "update"
    base_content_revision: Revision
    basis_hash: Text = ""
    base_values: dict[StrictStr, JsonValue] = Field(default_factory=dict)
    status: Literal["pending", "accepted", "rejected"] = "pending"
    patch: dict[StrictStr, JsonValue]
    applied_fields: list[Name] = Field(default_factory=list, max_length=100)
    task_id: Id | None = None
    source_refs: list[EntityRef] = Field(default_factory=list, max_length=1000)
    model: Text = ""
    issues: list[Text] = Field(default_factory=list, max_length=500)


class GenerationRecord(Named):
    status: Literal[
        "completed",
        "draft",
        "failed",
        "cancelled",
        "interrupted",
        "queued",
        "running",
        "awaiting_review",
        "applied",
    ]
    mode: Literal["simulated", "remote", "local", "imported"] = "imported"
    target_refs: list[EntityRef] = Field(default_factory=list, max_length=1000)
    model: Text = ""
    detail: Text = ""
    profile_id: Id | None = None
    profile_name: Text = ""
    model_endpoint: Text = ""
    purpose: Literal["character", "story", "dialogue", "text"] | None = None
    draft_ids: list[Id] = Field(default_factory=list, max_length=100)
    total: Annotated[StrictInt, Field(ge=0, le=10)] = 0
    finished: Annotated[StrictInt, Field(ge=0, le=10)] = 0
    failures: list[Text] = Field(default_factory=list, max_length=100)
    usage: dict[StrictStr, Annotated[StrictInt, Field(ge=0)]] = Field(default_factory=dict)
    items: list[dict[StrictStr, JsonValue]] = Field(default_factory=list, max_length=10)
    basis_hash: Text = ""


class Content(Contract):
    world: World = Field(default_factory=World)
    characters: list[Character] = Field(default_factory=list, max_length=10_000)
    locations: list[Location] = Field(default_factory=list, max_length=10_000)
    factions: list[Faction] = Field(default_factory=list, max_length=10_000)
    facts: list[Fact] = Field(default_factory=list, max_length=50_000)
    variables: list[Variable] = Field(default_factory=list, max_length=10_000)
    events: list[Event] = Field(default_factory=list, max_length=10_000)
    rules: list[Rule] = Field(default_factory=list, max_length=10_000)
    dialogues: list[Dialogue] = Field(default_factory=list, max_length=10_000)
    texts: list[StoryText] = Field(default_factory=list, max_length=10_000)
    relations: list[Relation] = Field(default_factory=list, max_length=50_000)
    initial_state: InitialState = Field(default_factory=InitialState)
    drafts: list[Draft] = Field(default_factory=list, max_length=10_000)
    simulation_cases: list[SimulationCase] = Field(default_factory=list, max_length=1000)
    generation_history: list[GenerationRecord] = Field(default_factory=list, max_length=10_000)


class Position(Contract):
    x: StrictInt | StrictFloat
    y: StrictInt | StrictFloat


class CanvasNode(Contract):
    entity: EntityRef
    position: Position
    visible: StrictBool = True


class CanvasEdge(Contract):
    relation_id: Id
    source_handle: Literal["left", "right", "top", "bottom"] = "right"
    target_handle: Literal["left", "right", "top", "bottom"] = "left"


class Canvas(Named):
    nodes: list[CanvasNode] = Field(default_factory=list, max_length=20_000)
    edges: list[CanvasEdge] = Field(default_factory=list, max_length=50_000)


class Editor(Contract):
    canvases: list[Canvas] = Field(default_factory=list, max_length=100)
    legacy_preview: LegacyPreviewSnapshot | None = None


class LegacyPreviewSnapshot(Contract):
    day: Annotated[StrictInt, Field(ge=1, le=5)] = 2
    evidence: StrictBool = True
    protected: StrictBool = False
    protectedDay: Annotated[StrictInt, Field(ge=1, le=5)] | None = None
    toldOrigin: StrictBool = False
    toldOriginDay: Annotated[StrictInt, Field(ge=1, le=5)] | None = None
    trust: Annotated[StrictInt | StrictFloat, Field(ge=0, le=1000)] = 1


class MigrationInfo(Contract):
    source_version: Literal[1]
    warnings: list[Text] = Field(default_factory=list)
    legacy_preview_snapshot: LegacyPreviewSnapshot | None = None
    legacy_world_revision: StrictInt | None = None


class Metadata(Contract):
    created_at: AwareDatetime = Field(default_factory=utc_now)
    updated_at: AwareDatetime = Field(default_factory=utc_now)
    migration: MigrationInfo | None = None


class Project(Contract):
    format: Literal["ludo-npc-project"] = "ludo-npc-project"
    schema_version: Literal[2] = 2
    project_id: Id = Field(default_factory=lambda: new_id("project"))
    name: Name = "未命名项目"
    revision: Revision = 1
    content_revision: Revision = 1
    layout_revision: Revision = 1
    content: Content = Field(default_factory=Content)
    editor: Editor = Field(default_factory=Editor)
    metadata: Metadata = Field(default_factory=Metadata)

    @field_validator("schema_version", mode="before")
    @classmethod
    def strict_version(cls, value):
        if type(value) is not int or value != 2:
            raise ValueError("schema_version 必须为整数 2")
        return value

    @model_validator(mode="after")
    def integrity(self):
        from .integrity import validate_project

        validate_project(self)
        return self
