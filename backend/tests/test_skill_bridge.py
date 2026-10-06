import importlib.util
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app
from ludo_npc.application.commands import CommandBatch, apply_commands
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash, review
from ludo_npc.simulation import SimulationInput, rehearse

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "skill_bridge", ROOT / "backend/ludo_npc/skill_bridge.py"
)
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)


def test_author_context_is_authenticated_and_hash_tracks_author_changes(tmp_path):
    with TestClient(
        create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects")
    ) as client:
        assert client.get("/api/v2/projects/absent/author-context").status_code == 401
        client.get("/api/session")
        imported = client.post("/api/v2/projects/import", json={"document": example()}).json()
        prefix = "/api/v2/projects/" + imported["project_id"]
        context = client.get(prefix + "/author-context").json()
        assert context["format"] == "ludo-author-context"
        assert context["project"] == imported
        assert context["author_hash"] == author_hash(imported)
        _, _, commands = bridge.draft_commands(
            imported, proposal(imported, {"story": "Pending story"})
        )
        updated = client.post(
            prefix + "/commands",
            json={"expected_revision": imported["revision"], "commands": commands},
        ).json()
        assert (
            client.get(prefix + "/author-context").json()["author_hash"] == context["author_hash"]
        )
        client.post(
            prefix + "/commands",
            json={
                "expected_revision": updated["revision"],
                "commands": [
                    {
                        "type": "patch_entity",
                        "target": {"kind": "character", "id": "char-healer"},
                        "changes": {"story": "Manual story"},
                    }
                ],
            },
        ).raise_for_status()
        assert (
            client.get(prefix + "/author-context").json()["author_hash"] != context["author_hash"]
        )


def example(language="zh"):
    return bridge.compile_story(
        bridge.read_json(ROOT / f"docs/examples/skill-storyboard.{language}.json")
    )


def proposal(project, patch):
    return {
        "format": "ludo-draft-proposal",
        "version": 1,
        "project_id": project["project_id"],
        "expected_revision": project["revision"],
        "expected_author_hash": author_hash(project),
        "changes": [
            {
                "target": {"kind": "character", "id": "char-healer"},
                "patch": patch,
                "name": "External story candidate",
            }
        ],
    }


@pytest.mark.parametrize("language", ["zh", "en"])
def test_story_mapping_and_play_paths(language):
    project = Project.model_validate(example(language))
    assert project.content.levels[0].region == ("潮汐小镇" if language == "zh" else "Tide Town")
    assert project.content.levels[0].description
    assert project.content.world.district == ""
    assert len(project.content.characters) == 3
    assert len(project.content.levels[0].npc_groups) == 1
    assert len([a for a in project.content.levels[0].appearances if a.npc_group_id]) == 2
    assert len(project.editor.canvases[0].edges) == 2
    assert len(project.editor.dialogue_layouts) == 3
    for state in ("healthy", "injured"):
        data = bridge.read_json(ROOT / f"docs/examples/skill-trial-{state}.json")
        result = rehearse(project, SimulationInput(expected_content_revision=1, **data))
        assert result["complete"]
        assert not result["diagnostics"]
        assert result["state"]["variables"]["var-injured"] is False
        assert result["state"]["variables"]["var-trust"] == (1 if state == "injured" else 0)
    alarm = rehearse(
        project,
        SimulationInput(
            expected_content_revision=1,
            at_tick=10,
            level_id="level-tide-town",
            location_id="loc-dock",
        ),
    )
    assert alarm["state"]["variables"]["var-alert"] is True
    assert project.content.variables[2].default is False


def test_pending_story_preserves_formal_fields_and_is_reviewable():
    project = Project.model_validate(example()).model_dump(mode="json")
    candidate, pending, commands = bridge.draft_commands(
        project, proposal(project, {"story": "New story"})
    )
    Project.model_validate(candidate)
    Project.model_validate(pending)
    old = project["content"]["characters"][0]["story"]
    updated = apply_commands(
        Project.model_validate(project), CommandBatch(expected_revision=1, commands=commands)
    )
    assert updated.content.characters[0].story == old
    draft_id = commands[0]["draft"]["id"]
    view = review(updated, draft_id)
    assert not view["stale"]
    accepted = apply_commands(
        updated,
        CommandBatch(
            expected_revision=updated.revision,
            commands=[
                {
                    "type": "review_draft",
                    "draft_id": draft_id,
                    "action": "accept",
                    "expected_author_hash": view["author_hash"],
                    "values": {"story": "New story"},
                }
            ],
        ),
    )
    assert accepted.content.characters[0].story == "New story"


def test_stale_snapshot_protection_and_duplicate_targets():
    project = Project.model_validate(example()).model_dump(mode="json")
    item = proposal(project, {"story": "Candidate"})
    item["expected_revision"] += 1
    with pytest.raises(bridge.BridgeError, match="stale"):
        bridge.draft_commands(project, item)
    item = proposal(project, {"story": "Candidate"})
    project["content"]["characters"][0]["confirmed_fields"] = ["story"]
    with pytest.raises(bridge.BridgeError, match="Confirmed"):
        bridge.draft_commands(project, item)
    project["content"]["characters"][0]["confirmed_fields"] = []
    item["changes"].append(item["changes"][0])
    with pytest.raises(bridge.BridgeError, match="duplicate"):
        bridge.draft_commands(project, item)
    with pytest.raises(bridge.BridgeError, match="ID/kind"):
        bridge.draft_commands(project, proposal(project, {"confirmed_fields": []}))


def test_new_draft_can_only_reference_formal_objects():
    project = Project.model_validate(example()).model_dump(mode="json")
    item = {
        "format": "ludo-draft-proposal",
        "version": 1,
        "project_id": project["project_id"],
        "expected_revision": 1,
        "expected_author_hash": author_hash(project),
        "changes": [
            {
                "target": {"kind": "character", "id": "char-new"},
                "operation": "create",
                "patch": {"name": "New character"},
            },
            {
                "target": {"kind": "text", "id": "text-new"},
                "operation": "create",
                "patch": {"name": "New letter", "body": "Hello", "author_id": "char-new"},
            },
        ],
    }
    candidate, pending, _ = bridge.draft_commands(project, item)
    Project.model_validate(candidate)
    with pytest.raises(ValueError):
        Project.model_validate(pending)


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:4174",
        "http://example.com",
        "http://127.0.0.1:4174/api",
        "http://user:key@localhost:4174",
        "http://localhost:4174?key=bad",
        "http://localhost:0",
    ],
)
def test_bridge_refuses_nonlocal_or_embedded_credentials(url):
    with pytest.raises(bridge.BridgeError):
        bridge.LocalAPI(url)


def test_strict_json_and_no_overwrite(tmp_path):
    path = tmp_path / "example.json"
    path.write_text('{"version":1,"version":2}', encoding="utf-8")
    with pytest.raises(bridge.BridgeError, match="Duplicate"):
        bridge.read_json(path)
    path.write_text('{"bad":NaN}', encoding="utf-8")
    with pytest.raises(bridge.BridgeError, match="number"):
        bridge.read_json(path)
    with pytest.raises(FileExistsError):
        bridge.write_json(path, {})
    assert "NaN" in path.read_text(encoding="utf-8")


def test_language_pack_generated_assets_match_and_story_structure_is_equivalent():
    left, right = (
        Project.model_validate(example(language)).model_dump(mode="json")
        for language in ("zh", "en")
    )
    for key in ("levels", "characters", "dialogues", "relations", "events"):
        assert [row["id"] for row in left["content"][key]] == [
            row["id"] for row in right["content"][key]
        ]
    for language in ("zh", "en"):
        folder = ROOT / f"skills/npcs-ai-studio-{language}"
        assert (folder / "scripts/npc_studio_bridge.py").read_bytes() == (
            ROOT / "backend/ludo_npc/skill_bridge.py"
        ).read_bytes()
        assert (
            json.loads((folder / "assets/project-v2.schema.json").read_text(encoding="utf-8"))
            == Project.model_json_schema()
        )
