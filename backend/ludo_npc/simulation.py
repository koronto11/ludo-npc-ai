"""Deterministic, bounded rehearsal. No model calls or authoring mutations."""

import math
from copy import deepcopy
from typing import Annotated

from pydantic import Field

from .domain.models import (
    CardTrial,
    ChoiceRecord,
    Contract,
    Id,
    Project,
    Revision,
    Scalar,
    SceneRecord,
    SimulationCase,
    StrictInt,
    Tick,
    value_matches,
)


class SimulationInput(Contract):
    expected_content_revision: Revision
    case_id: Id | None = None
    at_tick: Tick | None = None
    location_id: Id | None = None
    level_id: Id | None = None
    variable_overrides: dict[Id, Scalar] = Field(default_factory=dict)
    choices: list[ChoiceRecord] = Field(default_factory=list, max_length=10_000)
    scene_changes: list[SceneRecord] = Field(default_factory=list, max_length=1000)
    card_trial: CardTrial | None = None
    max_steps: Annotated[StrictInt, Field(ge=1, le=10_000)] = 2048


class SimulationError(ValueError):
    pass


def display(value):
    return "是" if value is True else "否" if value is False else str(value)


COMPARISON_LABELS = {"eq": "=", "ne": "≠", "gt": ">", "gte": "≥", "lt": "<", "lte": "≤"}


COMPARE = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "gt": lambda a, b: a > b,
    "gte": lambda a, b: a >= b,
    "lt": lambda a, b: a < b,
    "lte": lambda a, b: a <= b,
}


def inputs_for(project, request):
    base = next((c for c in project.content.simulation_cases if c.id == request.case_id), None)
    if request.case_id and base is None:
        raise SimulationError("预演分支不存在")
    data = (
        base.model_dump(mode="json")
        if base
        else {"id": "preview", "name": "临时预演", "at_tick": project.content.initial_state.tick}
    )
    for key in (
        "at_tick",
        "location_id",
        "level_id",
        "variable_overrides",
        "choices",
        "scene_changes",
    ):
        if key in request.model_fields_set:
            data[key] = request.model_dump(mode="json")[key]
    if data.get("at_tick") is None:
        data["at_tick"] = project.content.initial_state.tick
    # Future records remain in the branch when rewinding, but are never executed early.
    target = data["at_tick"]
    candidate = deepcopy(data)
    candidate["at_tick"] = max(
        [target]
        + [r["tick"] for r in data.get("choices", [])]
        + [r["tick"] for r in data.get("scene_changes", [])]
    )
    case = SimulationCase.model_validate(candidate)
    validation = project.model_dump(mode="json")
    validation["content"]["simulation_cases"] = [case.model_dump(mode="json")]
    Project.model_validate(validation)
    if target < project.content.initial_state.tick:
        raise SimulationError("预演时间不能早于初始状态")
    return case, target


def rehearse(project: Project, request: SimulationInput):
    case, target = inputs_for(project, request)
    trial = request.card_trial
    if trial:
        if case.choices or case.scene_changes:
            raise SimulationError("卡片试玩不能混入旧的选择或场景记录")
        graph = next((g for g in project.content.dialogues if g.id == trial.dialogue_id), None)
        if graph is None:
            raise SimulationError("试玩对白不存在，请打开当前项目中的对白")
        if trial.start_node_id and not any(n.id == trial.start_node_id for n in graph.nodes):
            raise SimulationError("试玩起点卡片已不存在")
        variables = {v.id: v for v in project.content.variables}
        options = {o.id for n in graph.nodes for o in n.options}
        for action in trial.actions:
            if action.type == "variable":
                variable = variables.get(action.variable_id)
                if variable is None or not value_matches(variable.value_type, action.value):
                    raise SimulationError("试玩变量不存在或值的类型不正确")
            elif action.option_id not in options:
                raise SimulationError("试玩记录中的玩家选项已不存在")
    content = project.content.model_dump(mode="json")
    lookup = {
        row["id"]: row
        for key in (
            "characters",
            "locations",
            "facts",
            "variables",
            "events",
            "rules",
            "dialogues",
            "texts",
        )
        for row in content[key]
    }
    initial = content["initial_state"]
    state = {
        "tick": initial["tick"],
        "scene_id": case.location_id,
        "variables": {row["id"]: row["default"] for row in content["variables"]},
        "characters": {
            row["id"]: {"location_id": None, "behavior": "", "known_fact_ids": []}
            for row in content["characters"]
        },
        "occurred_event_ids": [],
        "fired_rule_ids": [],
        "unlocked_text_ids": [],
    }
    state["variables"].update(initial["variables"])
    state["variables"].update(case.variable_overrides)
    state["characters"].update(deepcopy(initial["characters"]))
    starting_variables = deepcopy(state["variables"])
    log, diagnostics, cursors, visits, transcript = [], [], {}, {}, []
    # Separate presentation stream. Existing card-play transcripts and timeline logs
    # retain their contracts; only successful actions enter the chronological stream.
    story_flow = []
    story_flow_truncated = False
    shown_texts = set()

    def append_story(frame):
        nonlocal story_flow_truncated
        if len(story_flow) < 2048:
            story_flow.append(frame)
        else:
            story_flow_truncated = True

    steps = 0
    complete = True
    level = next((row for row in content["levels"] if row["id"] == case.level_id), None)

    def explain(condition):
        op = condition["op"]
        children = []
        if op in ("all", "any"):
            children = [explain(child) for child in condition["conditions"]]
            passed = (
                all(c["passed"] for c in children)
                if op == "all"
                else any(c["passed"] for c in children)
            )
            reason = "全部条件" if op == "all" else "任一条件"
        elif op == "not":
            children = [explain(condition["condition"])]
            passed = not children[0]["passed"]
            reason = "条件取反"
        elif op == "variable":
            actual = state["variables"][condition["variable_id"]]
            passed = COMPARE[condition["comparison"]](actual, condition["value"])
            reason = f"{lookup[condition['variable_id']]['name']}: {display(actual)} {COMPARISON_LABELS[condition['comparison']]} {display(condition['value'])}"
        elif op == "time":
            passed = COMPARE[condition["comparison"]](state["tick"], condition["value"])
            reason = f"故事时间: {state['tick']} {COMPARISON_LABELS[condition['comparison']]} {condition['value']}"
        elif op == "event_occurred":
            passed = condition["event_id"] in state["occurred_event_ids"]
            reason = f"事件“{lookup[condition['event_id']]['name']}”已发生"
        elif op == "knows":
            passed = (
                condition["fact_id"]
                in state["characters"][condition["character_id"]]["known_fact_ids"]
            )
            reason = f"{lookup[condition['character_id']]['name']}知道“{lookup[condition['fact_id']]['name']}”"
        elif op == "at_location":
            passed = (
                state["characters"][condition["character_id"]]["location_id"]
                == condition["location_id"]
            )
            reason = f"{lookup[condition['character_id']]['name']}位于{lookup[condition['location_id']]['name']}"
        elif op == "scene":
            passed = state["scene_id"] == condition["location_id"]
            reason = f"当前场景为{lookup[condition['location_id']]['name']}"
        elif op == "appearance":
            bound_level = next(
                row for row in content["levels"] if row["id"] == condition["level_id"]
            )
            bound = next(
                row for row in bound_level["appearances"] if row["id"] == condition["appearance_id"]
            )
            children = [
                {
                    "passed": case.level_id == bound_level["id"],
                    "reason": f"当前关卡为{bound_level['name']}",
                    "children": [],
                }
            ]
            if case.level_id == bound_level["id"]:
                children.append(appearance_reason(bound))
            passed = all(child["passed"] for child in children)
            reason = f"跟随{lookup[bound['character_id']]['name']}的这次出场"
        else:
            passed, reason = True, "无额外条件"
        return {"passed": passed, "reason": reason, "children": children}

    def story_reason(row):
        children = [explain(row["condition"])]
        scope = row.get("scope")
        if scope:
            scoped_level = next(
                item for item in content["levels"] if item["id"] == scope["level_id"]
            )
            children.append(
                {
                    "passed": case.level_id == scope["level_id"],
                    "reason": f"当前关卡为{scoped_level['name']}",
                    "children": [],
                }
            )
            if scope["track_id"]:
                track = next(
                    item for item in scoped_level["tracks"] if item["id"] == scope["track_id"]
                )
                children.append(
                    {
                        "passed": state["scene_id"] == track["location_id"],
                        "reason": f"当前场景为{track['name']}",
                        "children": [],
                    }
                )
        return {
            "passed": all(child["passed"] for child in children),
            "reason": "剧情触发条件",
            "children": children,
        }

    def appearance_reason(appearance):
        track = next((row for row in level["tracks"] if row["id"] == appearance["track_id"]), None)
        children = [
            {
                "passed": appearance["start_tick"] <= state["tick"] <= appearance["end_tick"],
                "reason": f"出场时间 {appearance['start_tick']}–{appearance['end_tick']}",
                "children": [],
            },
            {
                "passed": bool(track and track["location_id"] == state["scene_id"]),
                "reason": f"出场场景：{track['name'] if track else '尚未安排'}",
                "children": [],
            },
            explain(appearance["condition"]),
        ]
        return {
            "passed": all(row["passed"] for row in children),
            "reason": "人物出场条件",
            "children": children,
        }

    def graph_presence(graph):
        if not level or not graph["character_id"]:
            return {"passed": True, "reason": "通用对白", "children": []}
        appearances = [
            row
            for row in level["appearances"]
            if row["character_id"] == graph["character_id"]
            and (not row["dialogue_ids"] or graph["id"] in row["dialogue_ids"])
        ]
        children = [appearance_reason(row) for row in appearances]
        return {
            "passed": any(row["passed"] for row in children),
            "reason": "关卡中可用的人物出场",
            "children": children,
        }

    def error(code, message, source):
        diagnostics.append(
            {"code": code, "message": message, "source_id": source, "tick": state["tick"]}
        )

    def effect_problem(effects):
        variables = dict(state["variables"])
        for effect in effects:
            op = effect["op"]
            if (
                op == "grant_knowledge"
                and lookup[effect["fact_id"]]["available_at"] > state["tick"]
            ):
                return "事实尚未到可获知时间，整组效果未执行"
            if op == "set_variable":
                variables[effect["variable_id"]] = effect["value"]
            if op == "increment_variable":
                identifier = effect["variable_id"]
                variables[identifier] += effect["amount"]
                if isinstance(variables[identifier], float) and not math.isfinite(
                    variables[identifier]
                ):
                    return "数值效果溢出，整组效果未执行"
        return None

    def execute(kind, identifier, name, effects, reason):
        nonlocal steps, complete
        if steps >= request.max_steps:
            complete = False
            error(
                "step_limit",
                "连锁执行达到步数上限；本轮结果不完整，请检查规则和对话循环",
                identifier,
            )
            return False
        problem = effect_problem(effects)
        if problem:
            error("effect_blocked", problem, identifier)
            return False
        changes = []
        for effect in effects:
            op = effect["op"]
            if op in ("set_variable", "increment_variable"):
                container, key = state["variables"], effect["variable_id"]
                value = (
                    effect["value"] if op == "set_variable" else container[key] + effect["amount"]
                )
                path = f"variables.{key}"
            elif op in ("move_character", "set_behavior", "grant_knowledge"):
                character = effect["character_id"]
                container = state["characters"][character]
                key = {
                    "move_character": "location_id",
                    "set_behavior": "behavior",
                    "grant_knowledge": "known_fact_ids",
                }[op]
                value = (
                    effect.get("location_id") if op == "move_character" else effect.get("behavior")
                )
                if op == "grant_knowledge":
                    value = sorted(set(container[key]) | {effect["fact_id"]})
                path = f"characters.{character}.{key}"
            else:
                container, key = state, "unlocked_text_ids"
                value = sorted(set(state[key]) | {effect["text_id"]})
                path = key
            old = deepcopy(container[key])
            container[key] = value
            if old != value:
                changes.append({"path": path, "before": old, "after": deepcopy(value)})
        steps += 1
        log.append(
            {
                "tick": state["tick"],
                "kind": kind,
                "source_id": identifier,
                "name": name,
                "reason": reason,
                "changes": changes,
            }
        )
        if kind in ("event", "rule") and not trial:
            append_story(
                {
                    "kind": "state",
                    "presentation": kind,
                    "source_id": identifier,
                    "label": name,
                    "text": lookup[identifier].get("description", ""),
                    "tick": state["tick"],
                }
            )
        return True

    events = sorted(
        content["events"], key=lambda row: (row["scheduled_at"], -row["priority"], row["id"])
    )
    rules = sorted(content["rules"], key=lambda row: row["id"])

    def settle():
        while complete:
            progressed = False
            # Re-evaluate after every effect group, preserving stable priority and ID order.
            for kind, rows, fired in (
                ("event", events, state["occurred_event_ids"]),
                ("rule", rules, state["fired_rule_ids"]),
            ):
                for row in rows:
                    if (
                        not row["enabled"]
                        or row["id"] in fired
                        or (kind == "event" and row["scheduled_at"] > state["tick"])
                    ):
                        continue
                    reason = story_reason(row)
                    if reason["passed"] and not effect_problem(row["effects"]):
                        if not execute(kind, row["id"], row["name"], row["effects"], reason):
                            return
                        fired.append(row["id"])
                        progressed = True
                        break
                if progressed:
                    break
            if not progressed:
                return

    def entry_details(graph):
        nodes = {node["id"]: node for node in graph["nodes"]}
        for index, route in enumerate(graph["entry_routes"]):
            if (
                explain(route["condition"])["passed"]
                and explain(nodes[route["node_id"]]["condition"])["passed"]
            ):
                return nodes[route["node_id"]], index, explain(route["condition"])
        node = nodes[graph["entry_node_id"]]
        reason = explain(node["condition"])
        return (node if reason["passed"] else None), None, reason

    def entry(graph):
        if trial and graph["id"] == trial.dialogue_id and not trial.use_entry_routes:
            node = next(
                n
                for n in graph["nodes"]
                if n["id"] == (trial.start_node_id or graph["entry_node_id"])
            )
            return node if explain(node["condition"])["passed"] else None
        return entry_details(graph)[0]

    def enter(graph, node):
        if node is None:
            error("node_blocked", "对话入口或目标节点条件未满足", graph["id"])
            return False
        if visits.get(graph["id"], 0) >= 128:
            nonlocal complete
            complete = False
            error("dialogue_limit", "此对话已进入 128 个节点，请检查循环或重开分支", graph["id"])
            return False
        if not execute(
            "node",
            graph["id"] + ":" + node["id"],
            node["label"] or graph["name"],
            node["effects"],
            explain(node["condition"]),
        ):
            return False
        cursors[graph["id"]] = {"node_id": node["id"], "closed": False}
        visits[graph["id"]] = visits.get(graph["id"], 0) + 1
        settle()
        transcript.append(
            {
                "kind": "npc",
                "label": node["label"] or graph["name"],
                "text": node["text"],
                "node_id": node["id"],
                "speaker": lookup[node["speaker_id"]]["name"] if node["speaker_id"] else "旁白",
                "tick": state["tick"],
            }
        )
        if not trial:
            append_story(
                {**transcript[-1], "dialogue_id": graph["id"], "speaker_id": node["speaker_id"]}
            )
        return True

    def choose(record):
        graph = lookup[record.dialogue_id]
        if not graph_presence(graph)["passed"]:
            error(
                "appearance_blocked",
                "人物未在当前关卡、场景和时间出场，未执行对话效果",
                graph["id"],
            )
            return
        cursor = cursors.get(graph["id"])
        if record.action in ("start", "restart"):
            if record.action == "restart" or not cursor:
                enter(graph, entry(graph))
            return
        if cursor is None:
            if not enter(graph, entry(graph)):
                return
            cursor = cursors[graph["id"]]
        if cursor["closed"]:
            error("dialogue_closed", "对话已结束，需要显式重开对话", graph["id"])
            return
        node = next(n for n in graph["nodes"] if n["id"] == cursor["node_id"])
        option = next((o for o in node["options"] if o["id"] == record.option_id), None)
        if (
            not option
            or not explain(node["condition"])["passed"]
            or not explain(option["condition"])["passed"]
        ):
            error(
                "choice_unavailable",
                "记录的选项在该时间/节点不可用；未执行选择效果",
                record.option_id,
            )
            return
        target_node = next((n for n in graph["nodes"] if n["id"] == option["target_node_id"]), None)
        # Transactional choice + destination entry: target condition sees candidate effects.
        old_state, old_log, old_steps = deepcopy(state), len(log), steps
        if execute(
            "choice", option["id"], option["text"], option["effects"], explain(option["condition"])
        ):
            if target_node is None:
                transcript.append(
                    {
                        "kind": "player",
                        "text": option["text"],
                        "label": "玩家选择",
                        "node_id": node["id"],
                        "speaker": "玩家",
                        "tick": state["tick"],
                    }
                )
                if not trial:
                    append_story({**transcript[-1], "dialogue_id": graph["id"]})
                cursor["closed"] = True
                settle()
                transcript.append({"kind": "end", "text": "本段对话结束", "tick": state["tick"]})
                if not trial:
                    append_story({**transcript[-1], "dialogue_id": graph["id"]})
            elif not explain(target_node["condition"])["passed"] or effect_problem(
                target_node["effects"]
            ):
                state.clear()
                state.update(old_state)
                del log[old_log:]
                # A rejected jump cannot keep the choice's numerical/knowledge effects.
                set_steps(old_steps)
                error("target_blocked", "目标节点条件或效果不满足，选择事务已回滚", option["id"])
            else:
                transcript.append(
                    {
                        "kind": "player",
                        "text": option["text"],
                        "label": "玩家选择",
                        "node_id": node["id"],
                        "speaker": "玩家",
                        "tick": state["tick"],
                    }
                )
                if not trial:
                    append_story({**transcript[-1], "dialogue_id": graph["id"]})
                enter(graph, target_node)

    def set_steps(value):
        nonlocal steps
        steps = value

    unlock_targets = set()

    def unlocks(value):
        if isinstance(value, dict):
            if value.get("op") == "unlock_text":
                unlock_targets.add(value["text_id"])
            for child in value.values():
                unlocks(child)
        elif isinstance(value, list):
            for child in value:
                unlocks(child)

    unlocks([content["events"], content["rules"], content["dialogues"]])

    def present_environment():
        if trial or not state["scene_id"]:
            return
        for row in content["texts"]:
            if row["id"] in shown_texts or not explain(row["condition"])["passed"]:
                continue
            if row["id"] in unlock_targets and row["id"] not in state["unlocked_text_ids"]:
                continue
            shown_texts.add(row["id"])
            append_story(
                {
                    "kind": "state",
                    "presentation": "environment",
                    "source_id": row["id"],
                    "label": row["name"],
                    "text": row["body"],
                    "tick": state["tick"],
                }
            )

    def present_scene():
        if not trial and state["scene_id"]:
            append_story(
                {
                    "kind": "state",
                    "presentation": "scene",
                    "source_id": state["scene_id"],
                    "label": lookup[state["scene_id"]]["name"],
                    "text": "",
                    "tick": state["tick"],
                }
            )

    points = {initial["tick"], target}

    def boundaries(value):
        if isinstance(value, dict):
            if value.get("op") == "time":
                points.update((value["value"], value["value"] + 1))
            for child in value.values():
                boundaries(child)
        elif isinstance(value, list):
            for child in value:
                boundaries(child)

    boundaries(content["events"])
    boundaries(content["rules"])
    boundaries(content["texts"])
    points.update(row["scheduled_at"] for row in events)
    points.update(row["available_at"] for row in content["facts"])
    points.update(r.tick for r in case.choices)
    points.update(r.tick for r in case.scene_changes)
    records_by_tick = {}
    for category, records in (("scene", case.scene_changes), ("choice", case.choices)):
        for index, record in enumerate(records):
            # Legacy inputs have deterministic scene-before-choice ordering.
            key = (
                record.sequence if record.sequence is not None else -1,
                0 if category == "scene" else 1,
                index,
            )
            records_by_tick.setdefault(record.tick, []).append((key, category, record))
    for tick in sorted(t for t in points if initial["tick"] <= t <= target):
        if not complete:
            break
        state["tick"] = tick
        if tick == initial["tick"]:
            present_scene()
        settle()
        present_environment()
        for _, category, record in sorted(records_by_tick.get(tick, []), key=lambda r: r[0]):
            if not complete:
                break
            if category == "scene":
                old = state["scene_id"]
                state["scene_id"] = record.location_id
                if old != record.location_id:
                    shown_texts.clear()
                    present_scene()
                log.append(
                    {
                        "tick": tick,
                        "kind": "scene",
                        "source_id": record.location_id,
                        "name": lookup[record.location_id]["name"]
                        if record.location_id
                        else "未指定场景",
                        "reason": {"passed": True, "reason": "场景记录", "children": []},
                        "changes": [
                            {"path": "scene_id", "before": old, "after": record.location_id}
                        ],
                    }
                )
                settle()
                present_environment()
            else:
                checkpoint = (
                    deepcopy(state),
                    deepcopy(cursors),
                    deepcopy(visits),
                    len(log),
                    steps,
                    len(diagnostics),
                    len(transcript),
                    len(story_flow),
                    story_flow_truncated,
                )
                choose(record)
                if len(diagnostics) > checkpoint[5]:
                    state.clear()
                    state.update(checkpoint[0])
                    cursors.clear()
                    cursors.update(checkpoint[1])
                    visits.clear()
                    visits.update(checkpoint[2])
                    del log[checkpoint[3] :]
                    set_steps(checkpoint[4])
                    del transcript[checkpoint[6] :]
                    del story_flow[checkpoint[7] :]
                    story_flow_truncated = checkpoint[8]
                else:
                    present_environment()
    if trial and trial.started and complete:
        starting_variables = deepcopy(state["variables"])
        graph = lookup[trial.dialogue_id]
        choose(ChoiceRecord(tick=target, dialogue_id=trial.dialogue_id, action="start"))
        for action in trial.actions:
            if not complete or diagnostics:
                break
            if action.type == "variable":
                if execute(
                    "test_state",
                    action.variable_id,
                    "调整玩家状态",
                    [
                        {
                            "op": "set_variable",
                            "variable_id": action.variable_id,
                            "value": action.value,
                        }
                    ],
                    {"passed": True, "reason": "本次试玩的临时玩家状态", "children": []},
                ):
                    transcript.append(
                        {
                            "kind": "state",
                            "label": "调整玩家状态",
                            "text": f"{lookup[action.variable_id]['name']} → {display(action.value)}",
                            "tick": target,
                        }
                    )
                    settle()
            else:
                checkpoint = (
                    deepcopy(state),
                    deepcopy(cursors),
                    deepcopy(visits),
                    len(log),
                    steps,
                    len(diagnostics),
                    len(transcript),
                )
                choose(
                    ChoiceRecord(
                        tick=target, dialogue_id=trial.dialogue_id, option_id=action.option_id
                    )
                )
                if len(diagnostics) > checkpoint[5]:
                    state.clear()
                    state.update(checkpoint[0])
                    cursors.clear()
                    cursors.update(checkpoint[1])
                    visits.clear()
                    visits.update(checkpoint[2])
                    del log[checkpoint[3] :]
                    del transcript[checkpoint[6] :]
                    set_steps(checkpoint[4])
    # No automatic node effects merely for looking at a future preview.
    dialogues = []
    for graph in content["dialogues"]:
        presence = graph_presence(graph)
        restart_node, route_index, entry_reason = entry_details(graph)
        cursor = cursors.get(graph["id"])
        node = (
            next((n for n in graph["nodes"] if cursor and n["id"] == cursor["node_id"]), None)
            if cursor
            else entry(graph)
        )
        available = bool(
            presence["passed"]
            and node
            and not (cursor and cursor["closed"])
            and explain(node["condition"])["passed"]
        )
        options = []
        if node:
            for option in node["options"]:
                reason = explain(option["condition"])
                options.append(
                    {
                        "id": option["id"],
                        "text": option["text"],
                        "available": available and reason["passed"] and complete,
                        "reason": reason,
                        "target_node_id": option["target_node_id"],
                    }
                )
        dialogues.append(
            {
                "id": graph["id"],
                "name": graph["name"],
                "character_id": graph["character_id"],
                "node_id": node["id"] if node else None,
                "speaker_id": node["speaker_id"] if node else None,
                "node_label": node["label"] or "对白" if node else "未满足入口条件",
                "text": node["text"] if node and available else "",
                "available": available,
                "started": bool(cursor),
                "closed": bool(cursor and cursor["closed"]),
                "entry_preview": {
                    "node_id": restart_node["id"] if restart_node else None,
                    "node_label": restart_node["label"] if restart_node else "无可用开场",
                    "route_index": route_index,
                    "reason": entry_reason,
                },
                "reason": {
                    "passed": available,
                    "reason": "对白可用条件",
                    "children": [
                        presence,
                        explain(node["condition"])
                        if node
                        else {"passed": False, "reason": "没有满足条件的对话入口", "children": []},
                    ],
                },
                "options": options,
            }
        )
    event_status = []
    for row in events:
        status = (
            "occurred"
            if row["id"] in state["occurred_event_ids"]
            else "disabled"
            if not row["enabled"]
            else "scheduled"
            if row["scheduled_at"] > target
            else "blocked"
        )
        event_status.append(
            {
                "id": row["id"],
                "name": row["name"],
                "scheduled_at": row["scheduled_at"],
                "status": status,
                "reason": next(
                    (item["reason"] for item in log if item["source_id"] == row["id"]),
                    story_reason(row),
                ),
                "effect_problem": effect_problem(row["effects"]) if status == "blocked" else None,
            }
        )
    texts = []
    for row in content["texts"]:
        reason = explain(row["condition"])
        unlocked = row["id"] in state["unlocked_text_ids"]
        if row["id"] in unlock_targets:
            gate = {"passed": unlocked, "reason": "已由剧情效果解锁", "children": []}
            reason = {
                "passed": reason["passed"] and unlocked,
                "reason": "出现条件与解锁状态",
                "children": [reason, gate],
            }
        texts.append(
            {
                "id": row["id"],
                "name": row["name"],
                "body": row["body"],
                "available": reason["passed"],
                "reason": reason,
                "unlocked": unlocked,
            }
        )
    return {
        "project_id": project.project_id,
        "content_revision": project.content_revision,
        "case_id": case.id,
        "requested_tick": target,
        "complete": complete,
        "steps": steps,
        "state": state,
        "events": event_status,
        "rules": [
            {
                "id": row["id"],
                "name": row["name"],
                "status": "fired"
                if row["id"] in state["fired_rule_ids"]
                else "waiting"
                if row["enabled"]
                else "disabled",
                "reason": next(
                    (item["reason"] for item in log if item["source_id"] == row["id"]),
                    story_reason(row),
                ),
            }
            for row in rules
        ],
        "dialogues": dialogues,
        "level_id": case.level_id,
        "appearances": [
            {
                "id": row["id"],
                "character_id": row["character_id"],
                "track_id": row["track_id"],
                "behavior": row["behavior"],
                "reason": appearance_reason(row),
            }
            for row in level["appearances"]
        ]
        if level
        else [],
        "texts": texts,
        "log": log,
        "diagnostics": diagnostics,
        "transcript": transcript,
        "story_flow": story_flow,
        "story_flow_truncated": story_flow_truncated,
        "starting_variables": starting_variables,
        "execution_policy": "事件按时间/优先级/ID；规则按ID，每条事件/规则在分支中只触发一次；节点效果在进入时执行；时间推进先结算事件/规则，再按记录顺序处理场景与选择，每步后结算；回溯从初始状态重放",
    }
