import json

from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.models import Character, CharacterState, Level


def test_confirmed_library_deletes_save_backup_and_undo_without_removing_shared_content(tmp_path):
    project = campfire_project()
    project.content.characters.append(Character(id="unused-person", name="Unused"))
    project.content.initial_state.characters["unused-person"] = CharacterState(behavior="Ready")
    project.content.levels.append(Level(id="unused-level", name="Unused level", region="Region"))
    path = tmp_path / "projects" / "library.ludo.json"
    with TestClient(create_app(data_dir=tmp_path / "app", project_dir=path.parent)) as client:
        client.get("/api/session")
        current = client.post(
            "/api/v2/projects/import", json={"document": project.model_dump(mode="json")}
        ).json()
        prefix = "/api/v2/projects/" + current["project_id"]
        saved = client.post(
            prefix + "/save", json={"expected_revision": current["revision"], "path": str(path)}
        )
        saved.raise_for_status()
        current = saved.json()["project"]
        initial = current["content"]["initial_state"]
        state = {
            **initial,
            "characters": {
                key: value for key, value in initial["characters"].items() if key != "unused-person"
            },
        }
        command_sets = [
            [
                {"type": "delete_entity", "target": {"kind": "character", "id": "unused-person"}},
                {"type": "set_initial_state", "state": state},
            ],
            [{"type": "delete_level", "level_id": "unused-level"}],
        ]
        for commands in command_sets:
            changed = client.post(
                prefix + "/commands",
                json={"expected_revision": current["revision"], "commands": commands},
            )
            changed.raise_for_status()
            changed = changed.json()
            written = client.post(prefix + "/save", json={"expected_revision": changed["revision"]})
            written.raise_for_status()
            assert client.get(prefix + "/recovery").json()
            disk = json.loads(path.read_text(encoding="utf-8"))
            assert disk["content"] == changed["content"]
            assert disk["content"]["dialogues"] == current["content"]["dialogues"]
            restored = client.post(
                prefix + "/edit-history",
                json={"expected_revision": changed["revision"], "direction": "undo"},
            )
            restored.raise_for_status()
            restored = restored.json()["project"]
            assert restored["content"] == current["content"]
            current = restored
            client.post(
                prefix + "/save", json={"expected_revision": current["revision"]}
            ).raise_for_status()
        # Referenced locations still cannot be removed by another client bypassing the menu.
        refused = client.post(
            prefix + "/commands",
            json={
                "expected_revision": current["revision"],
                "commands": [
                    {
                        "type": "delete_entity",
                        "target": {
                            "kind": "location",
                            "id": project.content.levels[0].tracks[0].location_id,
                        },
                    }
                ],
            },
        )
        assert refused.status_code >= 400
        assert client.get(prefix).json()["content"] == current["content"]
