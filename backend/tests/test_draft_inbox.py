import pytest

from ludo_npc.application.commands import CommandBatch, CommandError, apply_commands
from ludo_npc.domain.models import Draft, GenerationRecord, Project
from ludo_npc.drafts import author_hash, validate_candidate
from ludo_npc.samples import outpost_project


def edit(project, *commands):
    return apply_commands(
        project,
        CommandBatch.model_validate({"expected_revision": project.revision, "commands": commands}),
    )


def fixture():
    p = outpost_project()
    p.content.drafts.append(
        Draft(
            id="draft-one",
            name="独立文本",
            target={"kind": "character", "id": "keeper"},
            patch={"story": "审核正文"},
            base_content_revision=p.content_revision,
            basis_hash=author_hash(p),
        )
    )
    p.content.generation_history.append(
        GenerationRecord(
            id="job-one",
            name="批量任务",
            status="failed",
            items=[
                {"name": "失败的第一项", "status": "failed", "error": "网络失败"},
                {"name": "已成功的第二项", "status": "draft"},
            ],
        )
    )
    return Project.model_validate(p.model_dump())


def deletion(source="draft", record_id="draft-one", item_index=None, deleted=True):
    return {
        "type": "set_generation_entry_deleted",
        "source": source,
        "record_id": record_id,
        "item_index": item_index,
        "deleted": deleted,
    }


def test_delete_restore_preserves_draft_history_content_hash_and_persists():
    p = fixture()
    hidden = edit(p, deletion())
    assert hidden.content == p.content
    assert hidden.content_revision == p.content_revision
    assert author_hash(hidden) == author_hash(p)
    reopened = Project.model_validate_json(hidden.model_dump_json())
    assert len(reopened.editor.deleted_generation_entries) == 1
    assert (
        validate_candidate(
            reopened, {"kind": "character", "id": "keeper"}, {"story": "新候选"}, "update"
        )["story"]
        == "新候选"
    )
    assert edit(reopened, deletion()).revision == reopened.revision
    restored = edit(reopened, deletion(deleted=False))
    assert not restored.editor.deleted_generation_entries
    assert restored.content == p.content


def test_only_actual_failed_items_can_be_deleted_without_hiding_siblings():
    p = fixture()
    hidden = edit(p, deletion("failed_item", "job-one", 0))
    assert hidden.content.generation_history[0].items == p.content.generation_history[0].items
    assert hidden.editor.deleted_generation_entries[0].item_index == 0
    for index in (None, 1, 9):
        with pytest.raises(CommandError):
            edit(p, deletion("failed_item", "job-one", index))
    p.content.generation_history[0].status = "running"
    with pytest.raises(CommandError, match="生成中"):
        edit(p, deletion("failed_item", "job-one", 0))


def test_deleted_pending_draft_cannot_be_adopted_until_restored():
    p = fixture()
    command = {
        "type": "review_draft",
        "draft_id": "draft-one",
        "action": "accept",
        "expected_author_hash": author_hash(p),
        "values": {"story": "审核正文"},
    }
    hidden = edit(p, deletion())
    with pytest.raises(CommandError, match="先恢复"):
        edit(hidden, command)
    restored = edit(hidden, deletion(deleted=False))
    adopted = edit(restored, command)
    accepted_deleted = edit(adopted, deletion())
    assert accepted_deleted.content.characters[0].story == "审核正文"
    assert (
        next(d for d in accepted_deleted.content.drafts if d.id == "draft-one").status == "accepted"
    )


def test_legacy_failure_and_atomic_invalid_delete():
    p = fixture()
    p.content.generation_history[0].items = []
    assert edit(p, deletion("failed_item", "job-one", 0)).editor.deleted_generation_entries
    with pytest.raises(CommandError):
        edit(p, deletion(), deletion("failed_item", "missing", 0))
    assert not p.editor.deleted_generation_entries
