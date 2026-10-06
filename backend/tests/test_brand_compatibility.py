from pathlib import Path

from ludo_npc.api.app import create_app
from ludo_npc.storage import LocalProjects, Settings, default_data_dir, default_project_dir


def test_fresh_install_uses_new_brand_folders(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "AppData"))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    assert default_data_dir() == tmp_path / "AppData/NPCs AI Studio"
    assert default_project_dir() == tmp_path / "Documents/NPCs AI Studio Projects"


def test_upgrade_keeps_legacy_settings_templates_and_selected_folder(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "AppData"))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    legacy = tmp_path / "AppData/Ludo NPC AI"
    legacy.mkdir(parents=True)
    chosen = tmp_path / "My authored worlds"
    settings = Settings(project_folder=str(chosen), recent=[str(chosen / "world.ludo.json")])
    (legacy / "settings.json").write_text(settings.model_dump_json(), encoding="utf-8")
    (legacy / "templates.json").write_text('{"author": "preserve"}', encoding="utf-8")
    old_projects = tmp_path / "Documents/Ludo Projects"
    old_projects.mkdir(parents=True)
    # A new but empty folder must not mask prior settings.
    (tmp_path / "AppData/NPCs AI Studio").mkdir()
    store = LocalProjects()
    assert store.data_dir == legacy
    assert store.settings.project_folder == str(chosen)
    assert store.settings.recent == settings.recent
    assert (legacy / "templates.json").read_text(encoding="utf-8") == '{"author": "preserve"}'
    assert default_project_dir() == old_projects
    store.shutdown()


def test_new_config_takes_precedence_without_moving_legacy_data(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    legacy = tmp_path / "Ludo NPC AI"
    legacy.mkdir()
    current = tmp_path / "NPCs AI Studio"
    current.mkdir()
    (current / "settings.json").write_text(Settings().model_dump_json(), encoding="utf-8")
    assert default_data_dir() == current
    assert legacy.is_dir()


def test_new_and_legacy_environment_overrides_and_explicit_paths(tmp_path, monkeypatch):
    monkeypatch.setenv("LUDO_DATA_DIR", str(tmp_path / "legacy-app"))
    monkeypatch.setenv("LUDO_PROJECT_DIR", str(tmp_path / "legacy-projects"))
    monkeypatch.delenv("NPCS_AI_STUDIO_DATA_DIR", raising=False)
    monkeypatch.delenv("NPCS_AI_STUDIO_PROJECT_DIR", raising=False)
    legacy = create_app()
    assert legacy.state.projects.data_dir == tmp_path / "legacy-app"
    assert legacy.state.projects.settings.project_folder == str(tmp_path / "legacy-projects")
    monkeypatch.setenv("NPCS_AI_STUDIO_DATA_DIR", str(tmp_path / "new-app"))
    monkeypatch.setenv("NPCS_AI_STUDIO_PROJECT_DIR", str(tmp_path / "new-projects"))
    current = create_app()
    assert current.state.projects.data_dir == tmp_path / "new-app"
    assert current.state.projects.settings.project_folder == str(tmp_path / "new-projects")
    explicit = create_app(data_dir=tmp_path / "explicit-app", project_dir=tmp_path / "explicit-projects")
    assert explicit.state.projects.data_dir == tmp_path / "explicit-app"
    assert explicit.state.projects.settings.project_folder == str(tmp_path / "explicit-projects")
    for app in (legacy, current, explicit):
        app.state.projects.shutdown()
