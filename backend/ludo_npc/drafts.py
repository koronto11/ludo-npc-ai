"""Field review and authoring fingerprints. Models never apply their own output."""

import hashlib
import json
from copy import deepcopy

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
    return hashlib.sha256(
        json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    ).hexdigest()


def target_row(data, target):
    return next(
        (r for r in data["content"][COLLECTIONS[target["kind"]]] if r["id"] == target["id"]), None
    )


def review(project, draft_id):
    data = project.model_dump(mode="json")
    draft = next((d for d in data["content"]["drafts"] if d["id"] == draft_id), None)
    if draft is None:
        raise ReviewError("草稿不存在")
    row = target_row(data, draft["target"])
    locked = set(row.get("confirmed_fields", [])) if row else set()
    stale = (
        draft["basis_hash"] != author_hash(data)
        if draft["basis_hash"]
        else draft["base_content_revision"] != project.content_revision
    )
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
    stale = (
        draft["basis_hash"] != basis
        if draft["basis_hash"]
        else draft["base_content_revision"] != data["content_revision"]
    )
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
    if row:
        row.update(value)
    else:
        data["content"][COLLECTIONS[target["kind"]]].append(value)
    Project.model_validate(data)
    return value
