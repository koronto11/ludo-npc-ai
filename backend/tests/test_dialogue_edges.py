import pytest
from pydantic import ValidationError

from ludo_npc.application.commands import CommandBatch, apply_commands
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.storage import LocalProjects


def project():
    return Project(
        content={
            "dialogues": [
                {
                    "kind": "dialogue",
                    "id": "chat",
                    "name": "问候",
                    "entry_node_id": "start",
                    "entry_routes": [{"node_id": "start", "condition": {"op": "always"}}],
                    "nodes": [
                        {
                            "id": "start",
                            "text": "晚上好",
                            "options": [{"id": "bye", "text": "再见"}],
                        }
                    ],
                }
            ]
        }
    )


def edit(doc, *commands):
    return apply_commands(
        doc,
        CommandBatch.model_validate(
            {"expected_revision": doc.revision, "commands": list(commands)}
        ),
    )


def layout(**extra):
    return {
        "type": "put_dialogue_layout",
        "dialogue_id": "chat",
        "positions": {"start": {"x": 300, "y": 40}},
        **extra,
    }


def test_edge_layout_roundtrip_is_editor_only_and_legacy_defaults(tmp_path):
    before = project()
    data = before.model_dump(mode="json")
    data["editor"].pop("dialogue_edges")
    assert Project.model_validate(data).editor.dialogue_edges == {}
    after = edit(
        before, layout(edges={"option:bye": {"color": "#85b59a", "points": [{"x": 450, "y": 200}]}})
    )
    assert before.content == after.content
    assert before.content_revision == after.content_revision
    assert after.layout_revision == before.layout_revision + 1
    assert author_hash(before) == author_hash(after)
    store = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        store.add(after)
        path = tmp_path / "projects" / "edges.ludo.json"
        store.save(after.project_id, after.revision, str(path))
    finally:
        store.shutdown()
    reopened = LocalProjects(tmp_path / "data", tmp_path / "projects")
    try:
        result = Project.model_validate(reopened.open_file(str(path))["project"])
        assert result.editor.dialogue_edges == after.editor.dialogue_edges
    finally:
        reopened.shutdown()
    # Old clients saving card positions leave line layouts intact.
    assert edit(after, layout()).editor.dialogue_edges == after.editor.dialogue_edges


@pytest.mark.parametrize(
    "edges",
    [
        {"missing": {"color": "#85b59a"}},
        {"option:bye": {"color": "red"}},
        {"option:bye": {"points": [{"x": 0, "y": 0}] * 9}},
        {"option:bye": {"points": [{"x": float("inf"), "y": 0}]}},
    ],
)
def test_invalid_edges_rejected_atomically(edges):
    before = project()
    with pytest.raises(ValidationError):
        edit(before, layout(edges=edges))
    assert before.editor.dialogue_edges == {}


def test_option_and_dialogue_removal_cleanup_and_route_reindex():
    doc = edit(
        project(),
        layout(edges={"option:bye": {"color": "#85b59a"}, "route:0": {"color": "#79b4cf"}}),
    )
    nodes = [node.model_dump(mode="json") for node in doc.content.dialogues[0].nodes]
    nodes[0]["options"] = []
    doc = edit(
        doc,
        {
            "type": "patch_entity",
            "target": {"kind": "dialogue", "id": "chat"},
            "changes": {"nodes": nodes, "entry_routes": []},
        },
    )
    assert doc.editor.dialogue_edges["chat"] == {}
    doc = edit(doc, {"type": "delete_entity", "target": {"kind": "dialogue", "id": "chat"}})
    assert doc.editor.dialogue_edges == {}


def test_max_length_option_id_can_keep_edge_marking():
    data = project().model_dump(mode="json")
    option_id = "a" * 100
    data["content"]["dialogues"][0]["nodes"][0]["options"][0]["id"] = option_id
    doc = Project.model_validate(data)
    marked = edit(doc, layout(edges={f"option:{option_id}": {"color": "#85b59a"}}))
    assert marked.editor.dialogue_edges["chat"][f"option:{option_id}"].color == "#85b59a"
