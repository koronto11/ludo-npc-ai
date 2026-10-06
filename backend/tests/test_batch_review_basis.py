from copy import deepcopy

import pytest

from ludo_npc.domain.models import Project
from ludo_npc.drafts import ReviewError, author_hash, review
from ludo_npc.samples import outpost_project
from tests.test_generation import edit


def fixture(*, common=False, update=False, same_actor=False, pool=False, count=3):
    project = outpost_project()
    actors = [f"npc-{chr(97 + i)}" for i in range(count)]
    commands = [{"type": "create_entity", "entity": {"kind": "character", "id": actor, "name": actor}} for actor in actors]
    if common:
        commands.append({"type": "create_entity", "entity": {"kind": "dialogue", "id": "common", "name": "共用", "character_id": None, "entry_node_id": "opening", "nodes": [{"id": "opening", "text": "共用问候"}]}})
    level = {"id": "batch-level", "name": "批量场景", "tracks": [{"id": "batch-track", "name": "篝火", "location_id": "outpost"}], "appearances": [{"id": f"appearance-{actor}", "character_id": actor, "track_id": "batch-track", "start_tick": 2, "end_tick": 6} for actor in actors]}
    if update:
        commands.append({"type": "create_entity", "entity": {"kind": "dialogue", "id": "dialogue-0", "name": "原对白", "character_id": actors[0], "entry_node_id": "opening", "nodes": [{"id": "opening", "text": "原文"}]}})
        level["appearances"][0]["dialogue_ids"] = ["dialogue-0"]
    commands.append({"type": "put_level", "level": level})
    project = edit(project, commands)
    basis = author_hash(project)
    drafts = []
    for i, actor in enumerate(actors):
        actor = actors[0] if same_actor else actor
        kind = "text" if pool else "dialogue"
        target_id = f"text-{i}" if pool else f"dialogue-{i}"
        patch = {"name": f"候选 {i}", "body": f"环境文本 {i}"} if pool else {"name": f"候选 {i}", "character_id": actor, "entry_node_id": "opening", "nodes": [{"id": "opening", "text": f"台词 {i}"}]}
        old = next((row for row in project.content.dialogues if row.id == target_id), None)
        drafts.append({"id": f"batch-draft-{i}", "name": f"候选 {i}", "target": {"kind": kind, "id": target_id}, "operation": "update" if update and i == 0 else "create", "patch": patch, "base_values": {key: old.model_dump(mode="json")[key] for key in patch} if old else {}, "basis_hash": basis, "base_content_revision": project.content_revision, "task_id": "batch-job", "scene_context": {"level_id": level["id"], "track_id": "batch-track", "location_id": "outpost", "appearance_id": None if pool else f"appearance-{actor}", "group_name": "同批", "mode": "pool" if pool else "people", "start_tick": 2, "end_tick": 6}})
    project = edit(project, [{"type": "put_draft", "draft": draft} for draft in drafts] + [{"type": "put_generation_record", "record": {"id": "batch-job", "name": "同批生成", "status": "awaiting_review", "draft_ids": [draft["id"] for draft in drafts], "basis_hash": basis}}])
    return project


def accept(project, index=0, **changes):
    draft = next(row for row in project.content.drafts if row.id == f"batch-draft-{index}")
    return edit(project, [{"type": "review_draft", "draft_id": draft.id, "action": "accept", "expected_author_hash": author_hash(project), "values": {**draft.patch, **changes}}])


@pytest.mark.parametrize("options", [{}, {"common": True}, {"update": True}, {"pool": True}, {"common": True, "count": 10}])
def test_independent_scene_candidates_allow_sequential_review_and_reopen(options):
    project = fixture(**options)
    original_basis = next(row for row in project.content.drafts if row.id == "batch-draft-0").basis_hash
    for i in range(options.get("count", 3)):
        before = project.model_dump(mode="json")
        assert not review(project, f"batch-draft-{i}")["stale"]
        assert project.model_dump(mode="json") == before  # Comparing never mutates history.
        project = accept(project, i)
        project = Project.model_validate_json(project.model_dump_json())
    assert all(row.status == "accepted" and row.basis_hash == original_basis for row in project.content.drafts if row.task_id == "batch-job")


@pytest.mark.parametrize("change", ["world", "actor", "scope", "adopted", "unrelated"])
def test_author_edits_still_stale_the_remaining_batch(change):
    project = accept(fixture(common=True))
    data = project.model_dump(mode="json")
    if change == "world":
        data["content"]["world"]["rules"].append("新约束")
    elif change == "actor":
        next(row for row in data["content"]["characters"] if row["id"] == "npc-b")["role"] = "已修改身份"
    elif change == "scope":
        data["content"]["levels"][-1]["tracks"][0]["name"] = "新场景名称"
    elif change == "adopted":
        next(row for row in data["content"]["dialogues"] if row["id"] == "dialogue-0")["nodes"][0]["text"] = "采用后的人工修改"
    else:
        data["content"]["characters"][0]["goals"].append("其他作者修改")
    project = Project.model_validate(data)
    assert review(project, "batch-draft-1")["stale"]
    with pytest.raises(ReviewError, match="过期"):
        accept(project, 1)


def test_same_actor_and_edited_adoption_remain_conservative():
    assert review(accept(fixture(same_actor=True)), "batch-draft-1")["stale"]
    project = fixture()
    nodes = deepcopy(next(row for row in project.content.drafts if row.id == "batch-draft-0").patch["nodes"])
    nodes[0]["text"] = "审核时手动改写"
    assert review(accept(project, nodes=nodes), "batch-draft-1")["stale"]


def test_cross_batch_provenance_and_concurrent_hash_checks_are_not_bypassed():
    project = accept(fixture())
    data = project.model_dump(mode="json")
    data["content"]["generation_history"][-1]["draft_ids"].remove("batch-draft-1")
    assert review(Project.model_validate(data), "batch-draft-1")["stale"]
    draft = next(row for row in project.content.drafts if row.id == "batch-draft-1")
    with pytest.raises(ReviewError, match="审核期间"):
        edit(project, [{"type": "review_draft", "draft_id": draft.id, "action": "accept", "values": draft.patch, "expected_author_hash": draft.basis_hash}])
