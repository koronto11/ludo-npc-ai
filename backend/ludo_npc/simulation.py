"""Deterministic, bounded rehearsal. No model calls or authoring mutations."""

import math
from copy import deepcopy
from typing import Annotated

from pydantic import Field

from .domain.models import (
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
)


class SimulationInput(Contract):
    expected_content_revision: Revision
    case_id: Id | None = None
    at_tick: Tick | None = None
    location_id: Id | None = None
    variable_overrides: dict[Id, Scalar] = Field(default_factory=dict)
    choices: list[ChoiceRecord] = Field(default_factory=list, max_length=10_000)
    scene_changes: list[SceneRecord] = Field(default_factory=list, max_length=1000)
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
    for key in ("at_tick", "location_id", "variable_overrides", "choices", "scene_changes"):
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
    log, diagnostics, cursors, visits = [], [], {}, {}
    steps = 0
    complete = True

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
        else:
            passed, reason = True, "无额外条件"
        return {"passed": passed, "reason": reason, "children": children}

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
                    reason = explain(row["condition"])
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

    def entry(graph):
        nodes = {node["id"]: node for node in graph["nodes"]}
        for route in graph["entry_routes"]:
            if (
                explain(route["condition"])["passed"]
                and explain(nodes[route["node_id"]]["condition"])["passed"]
            ):
                return nodes[route["node_id"]]
        node = nodes[graph["entry_node_id"]]
        return node if explain(node["condition"])["passed"] else None

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
        return True

    def choose(record):
        graph = lookup[record.dialogue_id]
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
                cursor["closed"] = True
                settle()
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
                enter(graph, target_node)

    def set_steps(value):
        nonlocal steps
        steps = value

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
        settle()
        for _, category, record in sorted(records_by_tick.get(tick, []), key=lambda r: r[0]):
            if not complete:
                break
            if category == "scene":
                old = state["scene_id"]
                state["scene_id"] = record.location_id
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
            else:
                checkpoint = (
                    deepcopy(state),
                    deepcopy(cursors),
                    deepcopy(visits),
                    len(log),
                    steps,
                    len(diagnostics),
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
    # No automatic node effects merely for looking at a future preview.
    dialogues = []
    for graph in content["dialogues"]:
        cursor = cursors.get(graph["id"])
        node = (
            next((n for n in graph["nodes"] if cursor and n["id"] == cursor["node_id"]), None)
            if cursor
            else entry(graph)
        )
        available = bool(
            node and not (cursor and cursor["closed"]) and explain(node["condition"])["passed"]
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
                "reason": explain(node["condition"])
                if node
                else {"passed": False, "reason": "没有满足条件的对话入口", "children": []},
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
                "reason": explain(row["condition"]),
                "effect_problem": effect_problem(row["effects"]) if status == "blocked" else None,
            }
        )
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
        "dialogues": dialogues,
        "texts": texts,
        "log": log,
        "diagnostics": diagnostics,
        "execution_policy": "事件按时间/优先级/ID；规则按ID，每条事件/规则在分支中只触发一次；节点效果在进入时执行；时间推进先结算事件/规则，再按记录顺序处理场景与选择，每步后结算；回溯从初始状态重放",
    }
