"""Typed references and cross-object invariants for authoring data."""

from .models import (
    COLLECTIONS,
    ENTITY_MODELS,
    AppearanceCondition,
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
    dialogue_edge_ids,
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
        elif isinstance(value, AppearanceCondition):
            require(
                not path.startswith("content.levels."),
                path,
                "出场条件不能引用其他出场，避免递归依赖",
            )
            bound_level = next((row for row in content.levels if row.id == value.level_id), None)
            require(bound_level is not None, path, "跟随出场的关卡不存在，请先解除对白联动")
            require(
                any(row.id == value.appearance_id for row in bound_level.appearances),
                path,
                "跟随的人物出场不存在，请先解除对白联动",
            )
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
            if row.scope:
                scoped_level = next(
                    (level for level in content.levels if level.id == row.scope.level_id), None
                )
                require(scoped_level is not None, path, "剧情关联关卡不存在")
                require(
                    row.scope.track_id is None
                    or any(track.id == row.scope.track_id for track in scoped_level.tracks),
                    path,
                    "剧情关联场景不存在，请先调整该场景的事件和规则",
                )
            if isinstance(row, Event) and row.anchor_id:
                require(row.scope is not None, path, "绑定锚点的事件必须指定关卡")
                anchor = next(
                    (anchor for anchor in scoped_level.anchors if anchor.id == row.anchor_id), None
                )
                require(anchor is not None, path, "事件时间锚点不存在")
                require(anchor.tick == row.scheduled_at, path, "事件时间与绑定锚点不一致")
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

    unique(content.levels, "content.levels")
    for level in content.levels:
        at = f"content.levels.{level.id}"
        unique(level.anchors, f"{at}.anchors")
        unique(level.tracks, f"{at}.tracks")
        unique(level.appearances, f"{at}.appearances")
        unique(level.npc_groups, f"{at}.npc_groups")
        anchors = {anchor.id: anchor for anchor in level.anchors}
        tracks = {track.id: track for track in level.tracks}
        groups = {group.id: group for group in level.npc_groups}
        for group in level.npc_groups:
            require(group.track_id in tracks, f"{at}.npc_groups.{group.id}", "NPC 组所在场景不存在")
        for track in level.tracks:
            ref("location", track.location_id, f"{at}.tracks.{track.id}")
        for appearance in level.appearances:
            path = f"{at}.appearances.{appearance.id}"
            ref("character", appearance.character_id, path)
            if appearance.npc_group_id:
                group = groups.get(appearance.npc_group_id)
                require(group is not None, path, "NPC 组不存在")
                if group:
                    require(
                        group.track_id == appearance.track_id,
                        path,
                        "NPC 组成员必须出现在组所在场景",
                    )
            require(
                appearance.track_id is None or appearance.track_id in tracks, path, "场景轨道不存在"
            )
            for edge in ("start", "end"):
                anchor_id = getattr(appearance, f"{edge}_anchor_id")
                if anchor_id:
                    require(anchor_id in anchors, path, "时间锚点不存在")
                    require(
                        anchors[anchor_id].tick == getattr(appearance, f"{edge}_tick"),
                        path,
                        "绑定锚点与出场时间不一致",
                    )
            condition(appearance.condition, f"{path}.condition")
            require(
                len(appearance.dialogue_ids) == len(set(appearance.dialogue_ids)),
                path,
                "出场对白重复",
            )
            for identifier in appearance.dialogue_ids:
                dialogue = ref("dialogue", identifier, path)
                require(
                    dialogue.character_id in (None, appearance.character_id),
                    path,
                    "出场对白属于另一个人物",
                )

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
        require(
            case.level_id is None or any(level.id == case.level_id for level in content.levels),
            at,
            "预演关卡不存在",
        )
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
    unique(project.editor.play_records, "editor.play_records")
    generation_keys = [
        (row.source, row.record_id, row.item_index)
        for row in project.editor.deleted_generation_entries
    ]
    require(
        len(generation_keys) == len(set(generation_keys)),
        "editor.deleted_generation_entries",
        "生成记录删除标记不能重复",
    )
    for row in project.editor.deleted_generation_entries:
        if row.source == "draft":
            require(
                any(d.id == row.record_id for d in content.drafts),
                "editor.deleted_generation_entries",
                "删除标记引用不存在的草稿",
            )
        else:
            record = next((r for r in content.generation_history if r.id == row.record_id), None)
            require(
                record is not None, "editor.deleted_generation_entries", "删除标记引用不存在的任务"
            )
            if record is not None:
                require(
                    (
                        bool(record.items)
                        and row.item_index < len(record.items)
                        and record.items[row.item_index].get("status") == "failed"
                    )
                    or (
                        not record.items
                        and row.item_index == 0
                        and record.status in {"failed", "interrupted", "cancelled"}
                    ),
                    "editor.deleted_generation_entries",
                    "删除标记引用的失败项不存在",
                )
    deleted_keys = [(row.source, row.record_id) for row in project.editor.deleted_play_records]
    require(
        len(deleted_keys) == len(set(deleted_keys)),
        "editor.deleted_play_records",
        "删除标记不能重复",
    )
    from .library_order import library_ids

    for scope, order in project.editor.library_orders.items():
        require(
            len(order) == len(set(order))
            and set(order) <= library_ids(content, project.editor, scope),
            "editor.library_orders",
            "排列引用重复或不属于同级资料",
        )
    for character_id in project.editor.character_notes:
        ref("character", character_id, "editor.character_notes")
    for level_id, widths in project.editor.level_control_widths.items():
        level = next((row for row in content.levels if row.id == level_id), None)
        require(level is not None, "editor.level_control_widths", "宽度引用不存在的关卡")
        if level is None:
            continue
        require(
            set(widths.groups) <= {row.id for row in level.npc_groups},
            "editor.level_control_widths.groups",
            "宽度引用不存在的 NPC 组",
        )
        require(
            set(widths.events)
            <= {row.id for row in content.events if row.scope and row.scope.level_id == level_id},
            "editor.level_control_widths.events",
            "宽度引用不属于关卡的事件",
        )
    for level_id, order in project.editor.level_control_orders.items():
        level = next((row for row in content.levels if row.id == level_id), None)
        require(level is not None, "editor.level_control_orders", "排列引用不存在的关卡")
        if level is None:
            continue
        allowed = (
            {f"appearance:{row.id}" for row in level.appearances if not row.npc_group_id}
            | {f"group:{row.id}" for row in level.npc_groups}
            | {
                f"event:{row.id}"
                for row in content.events
                if row.scope and row.scope.level_id == level_id
            }
        )
        require(
            len(order) == len(set(order)) and set(order) <= allowed,
            "editor.level_control_orders",
            "排列引用重复或不属于关卡的控件",
        )
    for dialogue_id, positions in project.editor.dialogue_layouts.items():
        dialogue = ref("dialogue", dialogue_id, "editor.dialogue_layouts")
        require(
            set(positions) <= {node.id for node in dialogue.nodes},
            "editor.dialogue_layouts",
            "对白布局引用不存在的节点",
        )
    for dialogue_id, edges in project.editor.dialogue_edges.items():
        dialogue = ref("dialogue", dialogue_id, "editor.dialogue_edges")
        require(
            set(edges) <= dialogue_edge_ids(dialogue),
            "editor.dialogue_edges",
            "连线布局引用不存在的对白分支",
        )
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
