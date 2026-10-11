"""Sparse, text-only review for one card, using existing persisted Draft fields."""

import hashlib
import re
from copy import deepcopy

CARD_ID = re.compile(r"^draft-agent-card-([a-f0-9]{32})-([a-f0-9]{16})$")


def is_card_draft(draft):
    return bool(CARD_ID.fullmatch(draft["id"]))


def card_changes(draft):
    from .drafts import ReviewError
    match = CARD_ID.fullmatch(draft["id"])
    if not match or draft["target"]["kind"] != "dialogue" or draft["operation"] != "update" or set(draft["patch"]) != {"nodes"}:
        raise ReviewError("协作卡片候选只能修改对白正文和玩家选项文字")
    before = draft["base_values"].get("nodes")
    after = draft["patch"]["nodes"]
    if not isinstance(before, list) or not isinstance(after, list) or len(before) != len(after):
        raise ReviewError("协作候选不能新增或删除卡片")
    if any(not isinstance(n, dict) or not isinstance(n.get("id"), str)
           or not isinstance(n.get("text"), str) or not isinstance(n.get("options"), list)
           or any(not isinstance(o, dict) or not isinstance(o.get("id"), str) or not isinstance(o.get("text"), str) for o in n["options"])
           for n in [*before, *after]):
        raise ReviewError("协作候选卡片格式无效")
    target = next((n for n in before if hashlib.sha256(n["id"].encode()).hexdigest()[:16] == match[2]), None)
    if target is None:
        raise ReviewError("协作卡片定位已失效")
    changes = []
    for old, new in zip(before, after, strict=True):
        if old["id"] != target["id"]:
            if old != new:
                raise ReviewError("协作候选不能修改其他卡片")
            continue
        stripped_old, stripped_new = deepcopy(old), deepcopy(new)
        if not isinstance(new.get("text"), str):
            raise ReviewError("协作候选必须提交文本")
        if old["text"] != new["text"]:
            changes.append((None, old["text"], new["text"]))
        stripped_old.pop("text")
        stripped_new.pop("text")
        if len(old["options"]) != len(new.get("options", [])):
            raise ReviewError("协作候选不能新增或删除玩家选项")
        for a, b in zip(stripped_old["options"], stripped_new["options"], strict=True):
            if not isinstance(b.get("text"), str):
                raise ReviewError("协作候选必须提交文本")
            if a["text"] != b["text"]:
                changes.append((a["id"], a["text"], b["text"]))
            a.pop("text")
            b.pop("text")
        if stripped_old != stripped_new:
            raise ReviewError("协作候选不能修改连线、条件、效果、说话者或卡片标题")
    return target["id"], changes


def text_field(node, option_id):
    from .drafts import ReviewError
    field = next((o for o in node["options"] if o["id"] == option_id), None) if option_id else node
    if field is None:
        raise ReviewError("协作候选的玩家选项已删除，请重新标记")
    return field


def sibling_basis_matches(data, draft):
    from .drafts import ReviewError, author_hash, target_row
    try:
        node_id, _ = card_changes(draft)
        group = CARD_ID.fullmatch(draft["id"])[1]
        restored = deepcopy(data)
        graph = target_row(restored, draft["target"])
        if not graph:
            return False
        seen = {node_id}
        siblings = [d for d in data["content"]["drafts"] if is_card_draft(d)
                    and CARD_ID.fullmatch(d["id"])[1] == group and d["id"] != draft["id"]
                    and d["status"] == "accepted" and d["basis_hash"] == draft["basis_hash"]
                    and d["target"] == draft["target"]]
        if not siblings:
            return False
        for sibling in siblings:
            identity, changes = card_changes(sibling)
            if identity in seen or sibling["applied_fields"] != ["nodes"]:
                return False
            seen.add(identity)
            node = next((n for n in graph["nodes"] if n["id"] == identity), None)
            if not node:
                return False
            for option_id, original, adopted in changes:
                field = text_field(node, option_id)
                if field["text"] != adopted:
                    return False
                field["text"] = original
        return author_hash(restored) == draft["basis_hash"]
    except (ReviewError, KeyError, TypeError):
        return False


def merged_nodes(data, draft, supplied=None, check_baseline=True):
    from .drafts import ReviewError, target_row
    proposal = {**draft, "patch": supplied} if supplied is not None else draft
    identity, changes = card_changes(proposal)
    graph = target_row(data, draft["target"])
    if not graph or "nodes" in graph.get("confirmed_fields", []):
        raise ReviewError("对白流程不存在或已确认保护")
    current = next((n for n in graph["nodes"] if n["id"] == identity), None)
    baseline = next(n for n in draft["base_values"]["nodes"] if n["id"] == identity)
    if current is None:
        raise ReviewError("协作卡片已删除，请重新标记")
    if check_baseline and current != baseline:
        raise ReviewError("卡片已被人工修改，请重新比较")
    nodes = deepcopy(graph["nodes"])
    node = next(n for n in nodes if n["id"] == identity)
    for option_id, _, candidate in changes:
        text_field(node, option_id)["text"] = candidate
    return nodes


def rebase_card(data, draft):
    from .drafts import target_row
    nodes = merged_nodes(data, draft, check_baseline=False)
    draft["base_values"] = {"nodes": deepcopy(target_row(data, draft["target"])["nodes"])}
    draft["patch"] = {"nodes": nodes}
