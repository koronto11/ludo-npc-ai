"""Explicit v1 -> v2 mapping. Never embed the raw legacy file or credentials."""

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

from .domain.models import (
    Canvas,
    Character,
    CharacterState,
    ChoiceRecord,
    Content,
    Dialogue,
    DialogueEntry,
    DialogueNode,
    DialogueOption,
    Editor,
    EntityRef,
    Event,
    Fact,
    Faction,
    GenerationRecord,
    Id,
    InitialState,
    LegacyPreviewSnapshot,
    Location,
    Metadata,
    MigrationInfo,
    Name,
    Position,
    Project,
    Relation,
    SimulationCase,
    StoryText,
    Text,
    Variable,
    World,
)


class DocumentError(ValueError):
    pass


class Legacy(BaseModel):
    model_config = ConfigDict(extra="ignore", allow_inf_nan=False)


class LegacyEntity(Legacy):
    id: Id
    kind: Literal["character", "location", "faction", "event", "dialogue"]
    name: Name
    role: Text = ""
    position: Position
    tier: Text = ""
    goal: Text = ""
    boundary: Text = ""
    knows: Text = ""
    unknown: Text = ""
    summary: Text = ""
    text: Text = ""
    characterId: Id | None = None
    hidden: StrictBool = False
    locked: StrictBool = False
    day: StrictInt | None = Field(default=None, ge=1, le=5)
    enabled: StrictBool = True
    requiresEvidence: StrictBool = False
    affects: list[Id] = Field(default_factory=list)


class LegacyRelation(Legacy):
    id: Id
    source: Id
    target: Id
    label: Text
    category: Literal["event", "dialogue"] | None = None


class LegacyWorld(Legacy):
    name: Name = "未命名世界"
    district: Text = ""
    revision: StrictInt = 1
    premise: Text = ""
    rules: list[Text] = Field(default_factory=list)
    tone: Text = ""


class LegacyTask(Legacy):
    id: Id
    name: Name
    status: Literal["draft", "completed"]
    detail: Text = ""


class LegacyProject(Legacy):
    version: Literal[1]
    name: Name
    world: LegacyWorld
    entities: list[LegacyEntity] = Field(max_length=1000)
    relations: list[LegacyRelation] = Field(max_length=5000)
    dialogue: dict[StrictStr, Text] = Field(default_factory=dict)
    notes: dict[StrictStr, Text] = Field(default_factory=dict)
    scenario: LegacyPreviewSnapshot = Field(default_factory=LegacyPreviewSnapshot)
    tasks: list[LegacyTask] = Field(default_factory=list, max_length=1000)


def load_document(data: dict) -> Project:
    if type(data.get("schema_version")) is int and data["schema_version"] == 2:
        return Project.model_validate(data)
    if type(data.get("version")) is int and data["version"] == 1:
        return migrate_v1(data)
    raise DocumentError("不支持的项目格式或版本；支持原型 v1 和 ludo-npc-project v2")


def migrate_v1(data: dict) -> Project:
    if type(data.get("version")) is not int or data["version"] != 1:
        raise DocumentError("旧项目 version 必须为整数 1")
    old = LegacyProject.model_validate(data)
    kinds = {item.id: item.kind for item in old.entities}
    if len(kinds) != len(old.entities):
        raise DocumentError("旧项目对象 ID 重复")
    occupied = set(kinds)

    def allocate(base):
        identifier = base
        index = 1
        while identifier in occupied:
            identifier = f"{base}-{index}"
            index += 1
        occupied.add(identifier)
        return identifier

    def reference(identifier) -> EntityRef:
        if identifier not in kinds:
            raise DocumentError(f"旧关系引用的对象不存在: {identifier}")
        return EntityRef(kind=kinds[identifier], id=identifier)

    def var(identifier, value, comparison="eq"):
        return {
            "op": "variable",
            "variable_id": identifier,
            "comparison": comparison,
            "value": value,
        }

    warnings = [
        "人物已知备注迁移为独立事实；未知备注保留为人物不确定信息。",
        "旧预演信任值缺少完整发生历史，保留为迁移快照，不伪造历史信任变化。",
    ]
    if data.get("modelProfile"):
        warnings.append("旧模型连接档案属于本机配置，本次不写入项目；认证信息已排除。")
    if set(data) - (set(LegacyProject.model_fields) | {"modelProfile"}):
        warnings.append("旧项目未识别的扩展字段未迁移，请保留原文件核对。")
    content = Content(world=World(**old.world.model_dump(exclude={"revision"}), clock_unit="day"))
    content.initial_state = InitialState(tick=1)
    evidence_id = allocate("var-evidence-public")
    content.variables.append(
        Variable(id=evidence_id, name="证据公开", value_type="boolean", default=True)
    )

    for item in old.entities:
        base = {"id": item.id, "name": item.name, "description": item.summary}
        if item.kind == "character":
            character = Character(
                **base,
                role=item.role,
                importance={"关键角色": "key", "背景角色": "background"}.get(
                    item.tier, "supporting"
                ),
                goals=[item.goal] if item.goal else [],
                boundary=item.boundary,
                story=item.summary,
                uncertainties=[item.unknown] if item.unknown else [],
                confirmed_fields=["name", "role", "goals", "boundary", "uncertainties"]
                if item.locked
                else [],
            )
            content.characters.append(character)
            state = CharacterState(behavior=item.goal)
            if item.knows:
                fact_id = allocate(f"fact-{item.id}-initial")
                content.facts.append(
                    Fact(
                        id=fact_id, name=f"{item.name}已知", description=item.knows, available_at=1
                    )
                )
                state.known_fact_ids.append(fact_id)
            content.initial_state.characters[item.id] = state
        elif item.kind == "location":
            content.locations.append(Location(**base, role=item.role))
        elif item.kind == "faction":
            content.factions.append(Faction(**base, role=item.role))
        elif item.kind == "event":
            if item.day is None:
                raise DocumentError(f"旧事件缺少日期: {item.id}")
            content.events.append(
                Event(
                    **base,
                    scheduled_at=item.day,
                    enabled=item.enabled,
                    affected_character_ids=item.affects,
                    condition=var(evidence_id, True) if item.requiresEvidence else {"op": "always"},
                )
            )
        elif item.kind == "dialogue":
            content.dialogues.append(
                Dialogue(
                    **base,
                    character_id=item.characterId,
                    entry_node_id="speech",
                    nodes=[
                        DialogueNode(
                            id="speech", speaker_id=item.characterId, text=item.text or item.summary
                        )
                    ],
                )
            )

    content.relations = [
        Relation(
            id=edge.id,
            source=reference(edge.source),
            target=reference(edge.target),
            label=edge.label,
            category={"event": "story", "dialogue": "dialogue"}.get(edge.category, "social"),
        )
        for edge in old.relations
    ]
    canvas = Canvas(
        id="canvas-main",
        name="角色与故事关联",
        nodes=[
            {"entity": reference(item.id), "position": item.position, "visible": not item.hidden}
            for item in old.entities
        ],
    )
    seed_case = SimulationCase(
        id="case-imported-preview",
        name="迁移时的预演",
        at_tick=old.scenario.day,
        variable_overrides={evidence_id: old.scenario.evidence},
        notes="旧预演快照完整保留于 metadata.migration；选择历史缺失时需人工核对。",
    )

    # The old engine contained story behavior in code. Lift that specific fixture
    # into declarative definitions; never invent these effects for other worlds.
    if (
        kinds.get("eve") == "character"
        and kinds.get("relic") == kinds.get("retaliation") == "event"
    ):
        trust_id, protected_id, origin_id = (
            allocate(base)
            for base in ("var-eve-trust", "var-eve-protected", "var-relic-origin-told")
        )
        for identifier, name, typ, default in [
            (trust_id, "伊芙信任", "number", 1),
            (protected_id, "保护承诺", "boolean", False),
            (origin_id, "已说明遗物来源", "boolean", False),
        ]:
            content.variables.append(
                Variable(id=identifier, name=name, value_type=typ, default=default)
            )
        events = {item.id: item for item in content.events}
        relic_fact, threat_fact, origin_fact = (
            allocate(base)
            for base in ("fact-relic-found", "fact-guild-threat", "fact-relic-origin")
        )
        content.facts.extend(
            [
                Fact(
                    id=relic_fact,
                    name="遗物已找到",
                    description="弟弟的遗物已被找到",
                    available_at=events["relic"].scheduled_at,
                ),
                Fact(
                    id=threat_fact,
                    name="公会追捕",
                    description="公会正在追捕知情者",
                    available_at=events["retaliation"].scheduled_at,
                ),
                Fact(
                    id=origin_fact,
                    name="遗物来源",
                    description="玩家说明了遗物的船员来源",
                    available_at=1,
                ),
            ]
        )
        lighthouse_location = allocate("location-abandoned-lighthouse")
        content.locations.append(Location(id=lighthouse_location, name="废弃灯塔"))
        if kinds.get("clinic") == "location":
            content.initial_state.characters["eve"].location_id = "clinic"
        content.initial_state.characters["eve"].behavior = "谨慎透露线索"
        relic = {"op": "event_occurred", "event_id": "relic"}
        threat = {"op": "event_occurred", "event_id": "retaliation"}
        events["relic"].effects = Event.model_validate(
            events["relic"].model_dump()
            | {
                "effects": [
                    {"op": "grant_knowledge", "character_id": "eve", "fact_id": relic_fact},
                    {"op": "set_behavior", "character_id": "eve", "behavior": "私下调查弟弟的去向"},
                ]
            }
        ).effects
        retaliation_effects = [
            {"op": "grant_knowledge", "character_id": "eve", "fact_id": threat_fact},
            {"op": "move_character", "character_id": "eve", "location_id": lighthouse_location},
            {"op": "set_behavior", "character_id": "eve", "behavior": "躲避公会"},
        ]
        for identifier, behavior in [("lorn", "拒绝继续配合调查"), ("mela", "向玩家传递伊芙去向")]:
            if kinds.get(identifier) == "character":
                retaliation_effects.append(
                    {"op": "set_behavior", "character_id": identifier, "behavior": behavior}
                )
        if "letter" in old.notes:
            letter_id = allocate("text-clinic-letter")
            content.texts.append(
                StoryText(
                    id=letter_id,
                    name="诊所信件",
                    text_type="letter",
                    body=old.notes["letter"],
                    author_id="eve",
                    condition=threat,
                )
            )
            retaliation_effects.append({"op": "unlock_text", "text_id": letter_id})
        events["retaliation"].effects = Event.model_validate(
            events["retaliation"].model_dump() | {"effects": retaliation_effects}
        ).effects

        def all_of(*conditions):
            return {"op": "all", "conditions": list(conditions)}

        protected = all_of(threat, var(protected_id, True))
        eligible_relic = all_of(relic, var(trust_id, 1, "gte"))
        revealed = all_of(eligible_relic, var(origin_id, True))
        dialogue_id = allocate("dialogue-eve-stages")

        def option(identifier, text, target, effects=None, condition=None):
            return DialogueOption(
                id=identifier,
                text=text,
                target_node_id=target,
                effects=effects or [],
                condition=condition or {"op": "always"},
            )

        increment = {"op": "increment_variable", "variable_id": trust_id, "amount": 1}
        origin_effects = [
            increment,
            {"op": "set_variable", "variable_id": origin_id, "value": True},
            {"op": "grant_knowledge", "character_id": "eve", "fact_id": origin_fact},
        ]
        protect_effects = [
            increment,
            {"op": "set_variable", "variable_id": protected_id, "value": True},
            {"op": "set_behavior", "character_id": "eve", "behavior": "愿意出庭作证"},
        ]
        nodes = [
            DialogueNode(
                id="opening",
                label="初次问诊",
                speaker_id="eve",
                text=old.dialogue.get("opening", ""),
                options=[option("greet", "表达关心", "opening", [increment])],
            ),
            DialogueNode(
                id="relic",
                label="遗物对话",
                speaker_id="eve",
                text=old.dialogue.get("relic", ""),
                condition=eligible_relic,
                options=[
                    option(
                        "origin", "说明遗物来源", "revealed", origin_effects, var(origin_id, False)
                    ),
                    option("brother", "询问弟弟身份", "brother"),
                ],
            ),
            DialogueNode(
                id="revealed",
                label="船员线索",
                speaker_id="eve",
                text=old.dialogue.get("revealed", ""),
                condition=revealed,
            ),
            DialogueNode(
                id="threatened",
                label="灯塔见面",
                speaker_id="eve",
                text=old.dialogue.get("threatened", ""),
                condition=threat,
                options=[
                    option(
                        "protect",
                        "答应保护她",
                        "protected",
                        protect_effects,
                        var(protected_id, False),
                    ),
                    option("searchers", "询问搜查者身份", "searchers"),
                ],
            ),
            DialogueNode(
                id="protected",
                label="愿意作证",
                speaker_id="eve",
                text=old.dialogue.get("protected", ""),
                condition=protected,
                options=[option("leave", "结束对话", None)],
            ),
            DialogueNode(
                id="brother",
                label="弟弟身份",
                speaker_id="eve",
                text="他叫艾伦，总说等攒够钱，就带我离开灯港。",
            ),
            DialogueNode(
                id="searchers",
                label="搜查者身份",
                speaker_id="eve",
                text="他们穿着公会制服，名单上不止我一个人。",
            ),
        ]
        content.dialogues.append(
            Dialogue(
                id=dialogue_id,
                name="伊芙条件对话",
                character_id="eve",
                entry_node_id="opening",
                entry_routes=[
                    DialogueEntry(node_id=node, condition=condition)
                    for node, condition in [
                        ("protected", protected),
                        ("threatened", threat),
                        ("revealed", revealed),
                        ("relic", eligible_relic),
                    ]
                ],
                nodes=nodes,
            )
        )
        if kinds.get("lighthouse") == "dialogue":
            next(item for item in content.dialogues if item.id == "lighthouse").nodes[
                0
            ].condition = Event.model_validate(
                events["retaliation"].model_dump() | {"condition": threat}
            ).condition
        for flag, when, option_id in [
            (old.scenario.protected, old.scenario.protectedDay, "protect"),
            (old.scenario.toldOrigin, old.scenario.toldOriginDay, "origin"),
        ]:
            if flag and when is not None and when <= old.scenario.day:
                seed_case.choices.append(
                    ChoiceRecord(tick=when, dialogue_id=dialogue_id, option_id=option_id)
                )
            elif flag:
                warnings.append(f"旧选择 {option_id} 缺少可回放时间，保留快照但不生成选择记录。")
        seed_case.choices.sort(key=lambda choice: choice.tick)
        warnings.append("灯港内置剧情已转成条件、效果和对话声明；执行与回放将在通用剧情批次实现。")
    else:
        for key, body in old.dialogue.items():
            content.texts.append(
                StoryText(id=allocate("legacy-dialogue-text"), name=f"旧对白 {key}", body=body)
            )
        warnings.append("此旧项目不是灯港示例；未为它推断程序中的隐藏剧情逻辑。")
    for key, body in old.notes.items():
        if key != "letter" or not any(text.text_type == "letter" for text in content.texts):
            content.texts.append(
                StoryText(id=allocate("legacy-note"), name=f"旧文本 {key}", body=body)
            )
    for task in old.tasks:
        content.generation_history.append(
            GenerationRecord(
                id=task.id, name=task.name, status=task.status, mode="simulated", detail=task.detail
            )
        )
    content.simulation_cases.append(seed_case)
    digest = hashlib.sha256(old.model_dump_json().encode("utf-8")).hexdigest()[:32]
    # Re-parse nested values to catch any assembly mistakes and validate references.
    return Project.model_validate(
        {
            "project_id": f"legacy-{digest}",
            "name": old.name,
            "content": content.model_dump(),
            "editor": Editor(canvases=[canvas]).model_dump(),
            "metadata": Metadata(
                migration=MigrationInfo(
                    source_version=1,
                    warnings=warnings,
                    legacy_preview_snapshot=old.scenario,
                    legacy_world_revision=old.world.revision,
                )
            ).model_dump(),
        }
    )


def dump_project(project: Project) -> str:
    return (
        json.dumps(
            Project.model_validate(project.model_dump()).model_dump(mode="json"),
            ensure_ascii=False,
            indent=2,
            allow_nan=False,
        )
        + "\n"
    )
