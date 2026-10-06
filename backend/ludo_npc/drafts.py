"""Field review and authoring fingerprints. Models never apply their own output."""

import hashlib
import json
from copy import deepcopy
from itertools import product

from .domain.models import COLLECTIONS, ENTITY_MODELS, Project


class ReviewError(ValueError):
    pass


def author_hash(project):
    data = project.model_dump(mode="json") if isinstance(project, Project) else project
    content = {
        k: v
        for k, v in data["content"].items()
        if k not in {"drafts", "generation_history", "simulation_cases"}
    }
    # New optional relationship fields preserve fingerprints of older v2 files.
    content["relations"] = [
        {
            key: value
            for key, value in relation.items()
            if not (key == "direction" and value == "forward")
            and not (key == "description" and value == "")
        }
        for relation in content.get("relations", [])
    ]
    # Visual annotations neither change generation inputs nor stale existing drafts.
    for collection in ("events", "rules"):
        content[collection] = [
            {
                key: value
                for key, value in row.items()
                if not (key in {"scope", "anchor_id"} and value is None)
            }
            for row in content.get(collection, [])
        ]
    if "levels" in content:
        content["levels"] = [
            {
                **level,
                **{
                    kind: [
                        {key: value for key, value in node.items() if key not in {"color", "icon"}}
                        for node in level[kind]
                    ]
                    for kind in ("anchors", "tracks")
                },
            }
            for level in content["levels"]
        ]
    for level in content.get("levels", []):
        # Adding an empty optional region must not invalidate existing draft baselines.
        if not level.get("region"):
            level.pop("region", None)
        if not level.get("npc_groups"):
            level.pop("npc_groups", None)
        level["appearances"] = [
            {
                key: value
                for key, value in appearance.items()
                if not (key == "npc_group_id" and value is None)
            }
            for appearance in level.get("appearances", [])
        ]
    return hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


def target_row(data, target):
    return next(
        (r for r in data["content"][COLLECTIONS[target["kind"]]] if r["id"] == target["id"]), None
    )


def same_batch_basis_matches(data, draft):
    """Prove that only independent, adopted scene candidates changed the basis.

    Keep the original hash: unrelated author edits still require explicit review.
    Legacy empty appearance links may have expanded during adoption; only a hash
    match against their possible original representation permits that reversal.
    """
    scope = draft.get("scene_context")
    task_id = draft.get("task_id")
    if not scope or not task_id or not draft.get("basis_hash"):
        return False
    job = next((row for row in data["content"]["generation_history"] if row["id"] == task_id), None)
    if not job or draft["id"] not in job["draft_ids"]:
        return False
    current_target = target_row(data, draft["target"])
    actor_id = draft["patch"].get("character_id", (current_target or {}).get("character_id"))
    if scope["mode"] == "people" and not actor_id:
        return False
    siblings = [
        row for row in data["content"]["drafts"]
        if row["id"] != draft["id"] and row["id"] in job["draft_ids"]
        and row["task_id"] == task_id and row["status"] == "accepted"
        and row["basis_hash"] == draft["basis_hash"]
    ]
    if not siblings:
        return False
    restored = deepcopy(data)
    links = {}
    seen_targets = {(draft["target"]["kind"], draft["target"]["id"])}
    for sibling in siblings:
        sibling_scope = sibling.get("scene_context")
        target = sibling["target"]
        target_key = (target["kind"], target["id"])
        row = target_row(restored, target)
        if not row or not sibling_scope or target_key in seen_targets:
            return False
        seen_targets.add(target_key)
        if scope["mode"] == "people":
            if target["kind"] != "dialogue" or sibling_scope["mode"] != "people" or row.get("character_id") == actor_id:
                return False
        elif scope["mode"] != "pool" or target["kind"] != "text" or sibling_scope["mode"] != "pool":
            return False
        try:
            _, appearance = scene_destination(restored, sibling_scope, target["kind"], row.get("character_id"))
        except ReviewError:
            return False
        applied = sibling["applied_fields"]
        if not applied or any(key not in sibling["patch"] for key in applied):
            return False
        try:
            candidate = ENTITY_MODELS[target["kind"]].model_validate({
                **(target if sibling["operation"] == "create" else row),
                **{key: sibling["patch"][key] for key in applied},
            }).model_dump(mode="json")
        except ValueError:
            return False
        if any(row.get(key) != candidate[key] for key in applied):
            # Edited-at-adoption values have no legacy immutable snapshot. Do not guess.
            return False
        if sibling["operation"] == "create":
            if row != candidate:
                return False
            restored["content"][COLLECTIONS[target["kind"]]].remove(row)
        else:
            if any(key not in sibling["base_values"] for key in applied):
                return False
            row.update({key: deepcopy(sibling["base_values"][key]) for key in applied})
        if appearance is not None and sibling["operation"] == "create":
            key = (sibling_scope["level_id"], appearance["id"])
            links.setdefault(key, (appearance, set()))[1].add(target["id"])
    ambiguous = []
    for appearance, adopted_ids in links.values():
        appearance["dialogue_ids"] = [identifier for identifier in appearance["dialogue_ids"] if identifier not in adopted_ids]
        available = [row["id"] for row in restored["content"]["dialogues"] if row["character_id"] in (None, appearance["character_id"])]
        if appearance["dialogue_ids"] and appearance["dialogue_ids"] == available:
            ambiguous.append((appearance, list(appearance["dialogue_ids"])))
    if author_hash(restored) == draft["basis_hash"]:
        return True
    # The normal legacy case is that every appearance inherited all dialogues.
    # Try that once even for the maximum ten-item batch before mixed subsets.
    for appearance, _ in ambiguous:
        appearance["dialogue_ids"] = []
    if ambiguous and author_hash(restored) == draft["basis_hash"]:
        return True
    # Bound work for legacy projects with many ambiguous all-dialogue bindings.
    if len(ambiguous) > 6:
        return False
    for flags in product((False, True), repeat=len(ambiguous)):
        for (appearance, explicit), empty in zip(ambiguous, flags):
            appearance["dialogue_ids"] = [] if empty else explicit
        if author_hash(restored) == draft["basis_hash"]:
            return True
    return False


def draft_is_stale(data, draft, basis=None):
    if not draft["basis_hash"]:
        return draft["base_content_revision"] != data["content_revision"]
    return draft["basis_hash"] != (basis or author_hash(data)) and not same_batch_basis_matches(data, draft)


def review(project, draft_id):
    data = project.model_dump(mode="json")
    draft = next((d for d in data["content"]["drafts"] if d["id"] == draft_id), None)
    if draft is None:
        raise ReviewError("草稿不存在")
    row = target_row(data, draft["target"])
    locked = set(row.get("confirmed_fields", [])) if row else set()
    stale = draft_is_stale(data, draft)
    fields = []
    for key, value in draft["patch"].items():
        before = draft["base_values"].get(key)
        current = row.get(key) if row else None
        fields.append(
            {
                "field": key,
                "base": before,
                "current": current,
                "candidate": value,
                "protected": key in locked,
                "conflict": draft["operation"] == "update"
                and key in draft["base_values"]
                and before != current,
            }
        )
    return {
        "draft": draft,
        "fields": fields,
        "stale": stale,
        "author_hash": author_hash(data),
        "revision": project.revision,
        "issues": draft["issues"],
        "status": draft["status"],
    }


def scene_destination(data, scope, kind, actor_id):
    level = next((row for row in data["content"]["levels"] if row["id"] == scope["level_id"]), None)
    track = (
        next((t for t in level["tracks"] if t["id"] == scope["track_id"]), None) if level else None
    )
    if track is None or track["location_id"] != scope["location_id"]:
        raise ReviewError("生成目标场景已移除或改动，请重新选择场景生成")
    if scope["start_tick"] < data["content"]["initial_state"]["tick"]:
        raise ReviewError("场景生成时间不能早于初始时间")
    if scope["mode"] == "pool":
        if kind != "text" or scope["appearance_id"] is not None:
            raise ReviewError("环境对白池只能关联场景文本")
        return level, None
    appearance = next((a for a in level["appearances"] if a["id"] == scope["appearance_id"]), None)
    if (
        kind != "dialogue"
        or appearance is None
        or appearance["track_id"] != track["id"]
        or appearance["character_id"] != actor_id
        or appearance["start_tick"] > scope["start_tick"]
        or appearance["end_tick"] < scope["end_tick"]
    ):
        raise ReviewError("生成目标人物出场已改变，请核对人物、场景和时间范围")
    return level, appearance


def apply_review(data, command, reviewed_hash=None):
    draft = next((d for d in data["content"]["drafts"] if d["id"] == command.draft_id), None)
    if not draft or draft["status"] != "pending":
        raise ReviewError("只有待审核草稿可以处理")
    if command.action == "reject":
        draft["status"] = "rejected"
        return
    basis = reviewed_hash or author_hash(data)
    if command.expected_author_hash != basis:
        raise ReviewError("审核期间设定已变化，请重新比较")
    stale = draft_is_stale(data, draft, basis)
    if stale:
        raise ReviewError("草稿依据已过期，请先重新比较并更新基准")
    if not command.values or not set(command.values) <= set(draft["patch"]):
        raise ReviewError("请选择草稿中的字段，不允许增加未审核字段")
    row = target_row(data, draft["target"])
    if draft["operation"] == "update":
        if row is None:
            raise ReviewError("目标对象已不存在")
        for field, value in command.values.items():
            if field in row.get("confirmed_fields", []) and value != row.get(field):
                raise ReviewError("已确认字段受保护，请通过人物设定手动修改")
            if field in draft["base_values"] and draft["base_values"][field] != row.get(field):
                raise ReviewError("字段已被人工修改，请重新比较")
        row.update(deepcopy(command.values))
    else:
        if row is not None:
            raise ReviewError("新建对象 ID 已存在")
        created = (
            ENTITY_MODELS[draft["target"]["kind"]]
            .model_validate(
                {"id": draft["target"]["id"], "kind": draft["target"]["kind"], **command.values}
            )
            .model_dump(mode="json")
        )
        data["content"][COLLECTIONS[created["kind"]]].append(created)
        if data["editor"]["canvases"]:
            board = data["editor"]["canvases"][0]
            board["nodes"].append(
                {
                    "entity": draft["target"],
                    "position": {
                        "x": 400 + len(board["nodes"]) % 5 * 310,
                        "y": 120 + len(board["nodes"]) // 5 * 200,
                    },
                    "visible": True,
                }
            )
    if draft.get("scene_context"):
        target = target_row(data, draft["target"])
        level, appearance = scene_destination(
            data, draft["scene_context"], target["kind"], target.get("character_id")
        )
        if appearance is not None and target["id"] not in appearance["dialogue_ids"]:
            # Preserve legacy empty-list meaning (all existing actor/common dialogues).
            if not appearance["dialogue_ids"]:
                appearance["dialogue_ids"] = [
                    g["id"]
                    for g in data["content"]["dialogues"]
                    if g["character_id"] in (None, appearance["character_id"])
                    and g["id"] != target["id"]
                ]
            appearance["dialogue_ids"].append(target["id"])
    draft["status"] = "accepted"
    draft["applied_fields"] = sorted(command.values)


def rebase(data, draft_id, expected_hash):
    if expected_hash != author_hash(data):
        raise ReviewError("重新比较期间设定已变化")
    draft = next((d for d in data["content"]["drafts"] if d["id"] == draft_id), None)
    if not draft or draft["status"] != "pending":
        raise ReviewError("只有待审核草稿可以更新基准")
    row = target_row(data, draft["target"])
    draft["base_values"] = {key: deepcopy(row.get(key)) for key in draft["patch"]} if row else {}
    draft["basis_hash"] = author_hash(data)
    draft["base_content_revision"] = data["content_revision"]


def validate_candidate(project, target, patch, operation):
    data = project.model_dump(mode="json")
    row = target_row(data, target)
    model = ENTITY_MODELS[target["kind"]]
    allowed = set(model.model_fields) - {"id", "kind", "confirmed_fields"}
    if not patch or not set(patch) <= allowed:
        raise ReviewError("模型输出包含不可修改字段")
    if operation == "update" and row is None:
        raise ReviewError("目标对象不存在")
    value = model.model_validate((row or target) | patch).model_dump(mode="json")
    data["content"]["drafts"] = []
    data["editor"]["deleted_generation_entries"] = [
        marker
        for marker in data["editor"]["deleted_generation_entries"]
        if marker["source"] != "draft"
    ]
    if row:
        row.update(value)
    else:
        data["content"][COLLECTIONS[target["kind"]]].append(value)
    Project.model_validate(data)
    return value
