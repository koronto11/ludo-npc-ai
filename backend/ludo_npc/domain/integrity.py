"""Typed references and cross-object invariants for authoring data."""

from .models import (
    COLLECTIONS,
    ENTITY_MODELS,
    Character,
    ConditionGroup,
    ConditionNot,
    Dialogue,
    Event,
    EventCondition,
    Fact,
    GrantKnowledge,
    IncrementVariable,
    KnowledgeCondition,
    Location,
    LocationCondition,
    MoveCharacter,
    Project,
    Rule,
    SceneCondition,
    SetBehavior,
    SetVariable,
    StoryText,
    UnlockText,
    VariableCondition,
    value_matches,
)


class IntegrityError(ValueError):
    pass


def require(test, path, message):
    if not test:
        raise IntegrityError(f"{path}: {message}")


def unique(items, path):
    ids = [item.id for item in items]
    require(len(ids) == len(set(ids)), path, "ID 重复")


def validate_project(project: Project):
    content = project.content
    registry = {}
    for kind, collection in COLLECTIONS.items():
        rows = getattr(content, collection)
        unique(rows, f"content.{collection}")
        for row in rows:
            require(
                row.id not in registry, f"content.{collection}.{row.id}", "ID 与其他类型对象重复"
            )
            registry[row.id] = row
    require(len(registry) <= 50_000, "content", "对象总数超过 50000")

    def ref(kind, identifier, path):
        if identifier is None:
            return None
        row = registry.get(identifier)
        require(
            row is not None and row.kind == kind,
            path,
            f"引用的 {kind} 对象不存在或类型不匹配: {identifier}",
        )
        return row

    def entity_ref(reference, path):
        return ref(reference.kind, reference.id, path)

    def variables(values, path):
        for identifier, value in values.items():
            variable = ref("variable", identifier, path)
            require(
                value_matches(variable.value_type, value), path, f"变量 {identifier} 的值类型不一致"
            )

    def condition(value, path, depth=0):
        require(depth <= 32, path, "条件嵌套超过 32 层")
        if isinstance(value, ConditionGroup):
            for index, child in enumerate(value.conditions):
                condition(child, f"{path}.conditions[{index}]", depth + 1)
        elif isinstance(value, ConditionNot):
            condition(value.condition, f"{path}.condition", depth + 1)
        elif isinstance(value, VariableCondition):
            variable = ref("variable", value.variable_id, path)
            require(value_matches(variable.value_type, value.value), path, "比较值与变量类型不一致")
            require(
                value.comparison in ("eq", "ne") or variable.value_type == "number",
                path,
                "大小比较仅适用于数值变量",
            )
        elif isinstance(value, EventCondition):
            ref("event", value.event_id, path)
        elif isinstance(value, KnowledgeCondition):
            ref("character", value.character_id, path)
            ref("fact", value.fact_id, path)
        elif isinstance(value, SceneCondition):
            ref("location", value.location_id, path)
        elif isinstance(value, LocationCondition):
            ref("character", value.character_id, path)
            ref("location", value.location_id, path)

    def effects(values, path):
        for index, value in enumerate(values):
            at = f"{path}[{index}]"
            if isinstance(value, SetVariable):
                variable = ref("variable", value.variable_id, at)
                require(
                    value_matches(variable.value_type, value.value), at, "设置值与变量类型不一致"
                )
            elif isinstance(value, IncrementVariable):
                variable = ref("variable", value.variable_id, at)
                require(variable.value_type == "number", at, "只有数值变量可累加")
            elif isinstance(value, GrantKnowledge):
                ref("character", value.character_id, at)
                ref("fact", value.fact_id, at)
            elif isinstance(value, MoveCharacter):
                ref("character", value.character_id, at)
                ref("location", value.location_id, at)
            elif isinstance(value, SetBehavior):
                ref("character", value.character_id, at)
            elif isinstance(value, UnlockText):
                ref("text", value.text_id, at)

    def row_refs(row, path):
        if isinstance(row, Character):
            editable = set(Character.model_fields) - {"id", "kind", "confirmed_fields"}
            require(
                len(set(row.confirmed_fields)) == len(row.confirmed_fields), path, "确认字段重复"
            )
            require(set(row.confirmed_fields) <= editable, path, "确认字段包含未知字段")
        elif isinstance(row, Location):
            ref("location", row.parent_id, path)
        elif isinstance(row, (Event, Rule)):
            condition(row.condition, f"{path}.condition")
            effects(row.effects, f"{path}.effects")
            if isinstance(row, Event):
                require(
                    len(set(row.affected_character_ids)) == len(row.affected_character_ids),
                    path,
                    "受影响人物重复",
                )
                for identifier in row.affected_character_ids:
                    ref("character", identifier, path)
        elif isinstance(row, Dialogue):
            ref("character", row.character_id, path)
            unique(row.nodes, f"{path}.nodes")
            nodes = {node.id for node in row.nodes}
            require(row.entry_node_id in nodes, path, "对话入口节点不存在")
            for route in row.entry_routes:
                require(route.node_id in nodes, path, "对话条件入口节点不存在")
                condition(route.condition, f"{path}.entry_routes")
            option_ids = []
            for node in row.nodes:
                at = f"{path}.nodes.{node.id}"
                ref("character", node.speaker_id, at)
                condition(node.condition, f"{at}.condition")
                effects(node.effects, f"{at}.effects")
                for option in node.options:
                    option_ids.append(option.id)
                    require(
                        option.target_node_id is None or option.target_node_id in nodes,
                        at,
                        "选项跳转节点不存在",
                    )
                    condition(option.condition, f"{at}.options.{option.id}.condition")
                    effects(option.effects, f"{at}.options.{option.id}.effects")
            require(len(option_ids) == len(set(option_ids)), path, "对话图内选项 ID 重复")
        elif isinstance(row, StoryText):
            ref("character", row.author_id, path)
            condition(row.condition, f"{path}.condition")

    for row in registry.values():
        row_refs(row, f"content.{COLLECTIONS[row.kind]}.{row.id}")

    # Hierarchy is a tree/forest. Dialogue loops are authorable and not rejected here.
    for location in content.locations:
        seen = set()
        current = location
        while current is not None:
            require(current.id not in seen, f"content.locations.{location.id}", "地点父级存在循环")
            seen.add(current.id)
            current = registry.get(current.parent_id) if current.parent_id else None

    unique(content.relations, "content.relations")
    for relation in content.relations:
        entity_ref(relation.source, f"content.relations.{relation.id}.source")
        entity_ref(relation.target, f"content.relations.{relation.id}.target")

    initial = content.initial_state
    variables(initial.variables, "content.initial_state.variables")
    for identifier, state in initial.characters.items():
        at = f"content.initial_state.characters.{identifier}"
        ref("character", identifier, at)
        ref("location", state.location_id, at)
        require(len(state.known_fact_ids) == len(set(state.known_fact_ids)), at, "已知事实重复")
        for fact_id in state.known_fact_ids:
            fact: Fact = ref("fact", fact_id, at)
            require(fact.available_at <= initial.tick, at, "初始状态提前获知未来事实")

    unique(content.simulation_cases, "content.simulation_cases")
    for case in content.simulation_cases:
        at = f"content.simulation_cases.{case.id}"
        require(case.at_tick >= initial.tick, at, "预演日期早于初始状态")
        ref("location", case.location_id, at)
        variables(case.variable_overrides, at)
        previous_tick = initial.tick
        for choice in case.choices:
            dialogue = ref("dialogue", choice.dialogue_id, at)
            options = {option.id for node in dialogue.nodes for option in node.options}
            require(
                choice.option_id is None or choice.option_id in options,
                at,
                "选择记录引用的选项不存在",
            )
            require(
                previous_tick <= choice.tick <= case.at_tick,
                at,
                "选择记录不按时间排序或超出预演时间",
            )
            previous_tick = choice.tick

        sequences = [
            r.sequence for r in [*case.choices, *case.scene_changes] if r.sequence is not None
        ]
        require(len(sequences) == len(set(sequences)), at, "同一分支的操作顺序编号重复")
        records = [choice.record_id for choice in case.choices if choice.record_id]
        require(len(records) == len(set(records)), at, "选择记录 ID 重复")
        previous_tick = initial.tick
        for scene in case.scene_changes:
            ref("location", scene.location_id, at)
            require(
                previous_tick <= scene.tick <= case.at_tick,
                at,
                "场景记录不按时间排序或超出预演时间",
            )
            previous_tick = scene.tick

    unique(content.drafts, "content.drafts")
    for draft in content.drafts:
        at = f"content.drafts.{draft.id}"
        if draft.operation == "create" and draft.status != "accepted":
            require(draft.target.id not in registry, at, "新建草稿 ID 已被正式对象使用")
            target = ENTITY_MODELS[draft.target.kind].model_validate(
                {"id": draft.target.id, "kind": draft.target.kind, **draft.patch}
            )
        else:
            target = entity_ref(draft.target, at)
        require(draft.base_content_revision <= project.content_revision, at, "草稿引用未来内容版本")
        for source in draft.source_refs:
            entity_ref(source, at)
        require(bool(draft.patch), at, "草稿修改为空")
        allowed = set(type(target).model_fields) - {"id", "kind", "confirmed_fields"}
        require(set(draft.patch) <= allowed, at, "草稿包含未知或不可修改字段")
        # Validate proposed field values and references without writing them to the target.
        candidate = ENTITY_MODELS[target.kind].model_validate(target.model_dump() | draft.patch)
        # Accepted/rejected candidate history survives later authoring changes.
        # Pending candidates retain valid references and are checked again on accept.
        if draft.status == "pending":
            row_refs(candidate, f"{at}.patch")

    unique(content.generation_history, "content.generation_history")
    for record in content.generation_history:
        for target in record.target_refs:
            entity_ref(target, f"content.generation_history.{record.id}")

    unique(project.editor.canvases, "editor.canvases")
    for canvas in project.editor.canvases:
        edges = [edge.relation_id for edge in canvas.edges]
        require(len(edges) == len(set(edges)), f"editor.canvases.{canvas.id}.edges", "关系布局重复")
        require(
            set(edges) <= {relation.id for relation in content.relations},
            f"editor.canvases.{canvas.id}.edges",
            "关系布局引用不存在的关系",
        )
        seen = set()
        for node in canvas.nodes:
            at = f"editor.canvases.{canvas.id}"
            entity_ref(node.entity, at)
            key = (node.entity.kind, node.entity.id)
            require(key not in seen, at, "同一画布中对象重复")
            seen.add(key)

    require(
        project.content_revision <= project.revision, "content_revision", "内容版本超过项目版本"
    )
    require(project.layout_revision <= project.revision, "layout_revision", "布局版本超过项目版本")
    require(
        project.metadata.created_at <= project.metadata.updated_at,
        "metadata",
        "更新时间早于创建时间",
    )
