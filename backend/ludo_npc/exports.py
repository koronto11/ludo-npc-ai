"""Read-only author handoffs. No draft, provider or editor data in text exports."""

import csv
import io
import json
import re
from typing import Literal

from .application.commands import CommandError, ProjectConflict
from .domain.models import Contract, Id, Revision
from .migration import dump_project


class ExportRequest(Contract):
    expected_revision: Revision
    format: Literal["project", "markdown", "csv"]
    level_id: Id | None = None


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def dialogue_scope(project, level_id):
    c = project.content
    levels = (
        c.levels
        if not level_id
        else [level_row for level_row in c.levels if level_row.id == level_id]
    )
    if level_id and not levels:
        raise CommandError("所选关卡已移除，请重新选择")
    appearances = [(level_row, a) for level_row in levels for a in level_row.appearances]
    by_actor = {}
    for graph in c.dialogues:
        by_actor.setdefault(graph.character_id, []).append(graph.id)
    ids = {
        identifier
        for _, a in appearances
        for identifier in (a.dialogue_ids or by_actor.get(a.character_id, []))
    }
    graphs = [g for g in c.dialogues if not level_id or g.id in ids]
    actor_ids = (
        {a.character_id for _, a in appearances}
        | {g.character_id for g in graphs}
        | {n.speaker_id for g in graphs for n in g.nodes}
    )
    actors = [a for a in c.characters if not level_id or a.id in actor_ids]
    return levels, appearances, graphs, actors


def condition_label(value, c):
    def name(identifier):
        return next(
            (
                r.name
                for rows in [c.characters, c.locations, c.facts, c.variables, c.events]
                for r in rows
                if r.id == identifier
            ),
            identifier,
        )

    op = value.op
    if op == "always":
        return "无额外条件"
    if op in {"all", "any"}:
        return (
            "（"
            + (" 且 " if op == "all" else " 或 ").join(
                condition_label(r, c) for r in value.conditions
            )
            + "）"
        )
    if op == "not":
        return "不满足：" + condition_label(value.condition, c)
    if op in {"variable", "time"}:
        lhs = name(value.variable_id) if op == "variable" else "故事时间"
        rhs = "是" if value.value is True else "否" if value.value is False else str(value.value)
        return f"{lhs} {dict(eq='=', ne='≠', gt='>', gte='≥', lt='<', lte='≤')[value.comparison]} {rhs}"
    if op == "appearance":
        level = next(level_row for level_row in c.levels if level_row.id == value.level_id)
        a = next(a for a in level.appearances if a.id == value.appearance_id)
        track = next((t.name for t in level.tracks if t.id == a.track_id), "待安排")
        return f"跟随 {name(a.character_id)} · {level.name} / {track} / {a.start_tick}–{a.end_tick}"
    if op == "scene":
        return "场景：" + name(value.location_id)
    if op == "knows":
        return f"{name(value.character_id)}知道{name(value.fact_id)}"
    if op == "at_location":
        return f"{name(value.character_id)}位于{name(value.location_id)}"
    return "事件已发生：" + name(value.event_id)


def fenced(value):
    raw = json_text(value)
    fence = "`" * max(3, max((len(m) for m in re.findall(r"`+", raw)), default=0) + 1)
    return f"{fence}json\n{raw}\n{fence}"


def markdown(project, level_id):
    c = project.content
    levels, appearances, graphs, actors = dialogue_scope(project, level_id)

    names = {
        row.id: row.name
        for rows in [c.characters, c.locations, c.factions, c.events, c.facts, c.dialogues, c.texts]
        for row in rows
    }
    graph_index = {graph.id: graph for graph in graphs}
    graph_order = {graph.id: index for index, graph in enumerate(graphs)}
    by_actor = {}
    for graph in graphs:
        by_actor.setdefault(graph.character_id, []).append(graph)

    def name(identifier):
        return names.get(identifier, "旁白" if identifier is None else identifier)

    lines = [
        f"# {project.name} · 设计稿",
        f"来源修订：{project.revision}；内容修订：{project.content_revision}",
        "范围：" + (levels[0].name if level_id else "全工程"),
        "作者设定导出，包含世界秘密和剧情条件；不是玩家可见文本。",
        f"## 世界 · {c.world.name}",
        c.world.premise,
        "### 世界规则",
        *[f"- {r}" for r in c.world.rules],
    ]
    for actor in actors:
        lines += [
            f"## 人物 · {actor.name}",
            f"身份：{actor.role}",
            "角色定位：" + {"key": "关键角色", "supporting": "支线角色", "background": "背景角色"}[actor.importance],
            actor.description,
            "### 人物故事",
            actor.story,
            "性格：" + "；".join(actor.personality),
            "口吻：" + actor.voice,
            "目标：" + "；".join(actor.goals),
            "底线：" + actor.boundary,
            "待定：" + "；".join(actor.uncertainties),
        ]
    for level in levels:
        lines += [
            f"## 关卡 · {level.name}",
            "所属区域：" + level.region,
            level.description,
            "### 时间锚点",
            *[f"- {a.tick}：{a.name}" for a in level.anchors],
        ]
        for track in level.tracks:
            lines += [
                f"### 场景 · {track.name}",
                f"地点 ID：{track.location_id}",
                track.description,
            ]
            for group in level.npc_groups:
                if group.track_id == track.id:
                    lines += [
                        f"NPC 组：{group.name}（"
                        + "、".join(
                            name(a.character_id)
                            for a in level.appearances
                            if a.npc_group_id == group.id
                        )
                        + "）"
                    ]
            for a in level.appearances:
                if a.track_id == track.id:
                    linked = (
                        [
                            graph_index[key]
                            for key in sorted(
                                a.dialogue_ids, key=lambda key: graph_order.get(key, -1)
                            )
                            if key in graph_index
                        ]
                        if a.dialogue_ids
                        else by_actor.get(a.character_id, [])
                    )
                    lines += [
                        f"- {name(a.character_id)}：{a.start_tick}–{a.end_tick}；行为：{a.behavior}；出场条件：{condition_label(a.condition, c)}；对白："
                        + "、".join(g.name for g in linked)
                    ]
        unassigned = [a for a in level.appearances if a.track_id is None]
        if unassigned:
            lines += [
                "### 待安排出场",
                *[f"- {name(a.character_id)}：{a.start_tick}–{a.end_tick}" for a in unassigned],
            ]
    lines += ["## 人物与对象关系"]
    actor_ids = {a.id for a in actors}
    for relation in c.relations:
        if level_id and relation.source.id not in actor_ids and relation.target.id not in actor_ids:
            continue
        lines += [
            f"- {name(relation.source.id)} {'↔' if relation.direction == 'both' else '→'} {name(relation.target.id)}：{relation.label}",
            relation.description,
        ]
    lines += ["## 对白与选项编排"]
    for g in graphs:
        lines += [
            f"### {g.name}",
            f"对白 ID：{g.id}；所属人物：{name(g.character_id)}；默认开场：{g.entry_node_id}",
        ]
        for index, route in enumerate(g.entry_routes, 1):
            lines += [f"条件开场 {index}：{condition_label(route.condition, c)} → {route.node_id}"]
        for n in g.nodes:
            lines += [
                f"#### {n.label or n.id}",
                f"节点 ID：{n.id}；说话者：{name(n.speaker_id)}",
                n.text,
                "可用条件：" + condition_label(n.condition, c),
            ]
            if n.effects:
                lines += ["进入效果：", fenced([e.model_dump(mode="json") for e in n.effects])]
            for index, o in enumerate(n.options, 1):
                lines += [
                    f"{index}. {o.text}",
                    f"   条件：{condition_label(o.condition, c)}；跳转：{o.target_node_id or '结束对话'}",
                ]
                if o.effects:
                    lines += [
                        "   选择效果：",
                        fenced([e.model_dump(mode="json") for e in o.effects]),
                    ]
    lines += ["## 剧情事件与规则（本关卡及全局）" if level_id else "## 剧情事件与规则"]
    for row in [*c.events, *c.rules]:
        if level_id and row.scope and row.scope.level_id != level_id:
            continue
        lines += [
            f"### {row.name}",
            row.description,
            "启用：" + str(row.enabled),
            "条件：" + condition_label(row.condition, c),
        ]
        if row.kind == "event":
            lines += [f"计划时间：{row.scheduled_at}；锚点：{row.anchor_id or '独立时间'}"]
        lines += [
            "作用域与效果：",
            fenced(
                {
                    "scope": row.scope.model_dump(mode="json") if row.scope else None,
                    "effects": [e.model_dump(mode="json") for e in row.effects],
                }
            ),
        ]
    lines += [
        "## 全工程上下文资料（未按关卡筛选）",
        fenced(
            {
                "facts": [f.model_dump(mode="json") for f in c.facts],
                "variables": [v.model_dump(mode="json") for v in c.variables],
                "locations": [location.model_dump(mode="json") for location in c.locations],
                "initial_state": c.initial_state.model_dump(mode="json"),
            }
        ),
        "## 全工程非对话文本（未按关卡筛选）",
    ]
    for t in c.texts:
        lines += [
            f"### {t.name}",
            f"类型：{t.text_type}；作者：{name(t.author_id)}",
            t.body,
            "条件：" + condition_label(t.condition, c),
        ]
    return "\n\n".join(lines) + "\n"


def csv_cell(value):
    raw = str(value)
    # Keep imported spreadsheet cells literal, including whitespace-prefixed formulas.
    return (
        "'" + raw
        if raw.lstrip().startswith(("=", "+", "-", "@")) or raw.startswith(("\t", "\r"))
        else raw
    )


def dialogue_csv(project, level_id):
    _, appearances, graphs, _ = dialogue_scope(project, level_id)
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "记录类型",
            "对白ID",
            "对白名称",
            "人物ID",
            "所属人物",
            "说话者ID",
            "说话者",
            "节点ID",
            "节点标题",
            "正文",
            "条件JSON",
            "效果JSON",
            "选项ID",
            "跳转节点ID",
            "出场绑定JSON",
        ]
    )
    names = {actor.id: actor.name for actor in project.content.characters}
    by_actor = {}
    by_graph = {}
    for graph in graphs:
        by_actor.setdefault(graph.character_id, []).append(graph.id)
    for level_row, a in appearances:
        binding = {
            "level_id": level_row.id,
            "level_name": level_row.name,
            "appearance_id": a.id,
            "track_id": a.track_id,
            "scene_name": next((t.name for t in level_row.tracks if t.id == a.track_id), "待安排"),
            "location_id": next(
                (t.location_id for t in level_row.tracks if t.id == a.track_id), None
            ),
            "npc_group_id": a.npc_group_id,
            "start_tick": a.start_tick,
            "end_tick": a.end_tick,
            "condition": a.condition.model_dump(mode="json"),
            "behavior": a.behavior,
        }
        for graph_id in a.dialogue_ids or by_actor.get(a.character_id, []):
            by_graph.setdefault(graph_id, []).append(binding)
    for g in graphs:
        bindings = by_graph.get(g.id, [])
        common = [g.id, g.name, g.character_id or "", names.get(g.character_id, "未指定")]

        def write(kind, speaker, node, label, text, condition, effects, option, target):
            writer.writerow(
                [
                    csv_cell(v)
                    for v in [
                        kind,
                        *common,
                        speaker or "",
                        names.get(speaker, "玩家" if kind == "玩家选项" else "旁白"),
                        node,
                        label,
                        text,
                        json_text(condition),
                        json_text(effects),
                        option,
                        target or "",
                        json_text(bindings),
                    ]
                ]
            )

        write("默认开场", None, "", "", "", {"op": "always"}, [], "", g.entry_node_id)
        for route in g.entry_routes:
            write(
                "条件开场",
                None,
                "",
                "",
                "",
                route.condition.model_dump(mode="json"),
                [],
                "",
                route.node_id,
            )
        for n in g.nodes:
            write(
                "对白",
                n.speaker_id,
                n.id,
                n.label,
                n.text,
                n.condition.model_dump(mode="json"),
                [e.model_dump(mode="json") for e in n.effects],
                "",
                None,
            )
            for o in n.options:
                write(
                    "玩家选项",
                    None,
                    n.id,
                    n.label,
                    o.text,
                    o.condition.model_dump(mode="json"),
                    [e.model_dump(mode="json") for e in o.effects],
                    o.id,
                    o.target_node_id,
                )
    return "\ufeff" + output.getvalue()


def build_export(project, request):
    if project.revision != request.expected_revision:
        raise ProjectConflict(project.revision)
    levels, appearances, graphs, actors = dialogue_scope(project, request.level_id)
    if request.format == "project" and request.level_id:
        raise CommandError("工程备份包含整个项目；请选择全工程范围")
    extension, mime, text = {
        "project": lambda: ("ludo.json", "application/json", dump_project(project)),
        "markdown": lambda: ("md", "text/markdown", markdown(project, request.level_id)),
        "csv": lambda: ("csv", "text/csv", dialogue_csv(project, request.level_id)),
    }[request.format]()
    title = levels[0].name if request.level_id else project.name
    filename = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", title).strip(" .")[:90] or "NPCs AI Studio"
    return {
        "filename": f"{filename}.{extension}",
        "mime": mime,
        "text": text,
        "revision": project.revision,
        "counts": {
            "characters": len(actors),
            "appearances": len(appearances),
            "dialogues": len(graphs),
            "nodes": sum(len(g.nodes) for g in graphs),
        },
        "scope": "关卡" if request.level_id else "全工程",
    }
