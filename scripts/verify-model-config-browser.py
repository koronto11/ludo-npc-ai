"""Verify local files after the recorded CUA flow; this does not automate a browser."""

import json
from pathlib import Path

import httpx2 as httpx

ROOT = Path(__file__).resolve().parents[1]
info = json.loads((ROOT / ".local-data/settings.json").read_text(encoding="utf-8"))
a = next(p for p in info["model_profiles"] if p["name"] == "【协议测试】角色初稿")
b = next(p for p in info["model_profiles"] if p["name"] == "【协议测试】对话精修")
project = json.loads(
    (ROOT / ".local-projects/多模型配置验证.ludo.json").read_text(encoding="utf-8")
)
record = project["content"]["generation_history"][-1]
original = json.loads(
    (ROOT / ".local-projects/第四批-生成审核验证.ludo.json").read_text(encoding="utf-8")
)
checks = {
    "saved_purpose_defaults": info["active_profile_id"] == a["id"]
    and info["purpose_defaults"]
    == {"character": a["id"], "story": a["id"], "dialogue": b["id"], "text": b["id"]},
    "independent_limits": a["max_tokens"] == 2048 and b["max_tokens"] == 4096,
    "actual_temporary_model_in_task_file": record["profile_id"] == b["id"]
    and record["profile_name"] == b["name"]
    and record["purpose"] == "character"
    and record["status"] == "awaiting_review",
    "formal_character_not_added_before_review": len(project["content"]["characters"])
    == 1,
    "previous_author_content_preserved": original["content_revision"] == 43
    and len(original["content"]["characters"]) == 6
    and original["content"]["characters"][0]["story"]
    == "夏岚曾负责驿站账目，她坚持只向访客解释已经核实的补给记录。",
    "no_dummy_keys_in_settings_project_history_backups": all(
        key not in path.read_text(encoding="utf-8")
        for folder in [ROOT / ".local-data", ROOT / ".local-projects"]
        for path in folder.rglob("*")
        if path.is_file() and path.suffix in {".json", ".bak", ".log"}
        for key in [
            "fixture-key-A-not-a-real-credential",
            "fixture-key-B-not-a-real-credential",
        ]
    ),
    "packaged_frontend_matches_built_source": all(
        (
            ROOT
            / "release/LudoNPC/_internal/frontend"
            / path.relative_to(ROOT / "dist/client")
        ).read_bytes()
        == path.read_bytes()
        for path in (ROOT / "dist/client").rglob("*")
        if path.is_file()
    ),
}
for name, passed in checks.items():
    assert passed, name
with httpx.Client(base_url="http://127.0.0.1:4174", trust_env=False) as client:
    client.get("/api/session")
    actual = client.get("/api/workspace").json()
    assert actual["purpose_defaults"] == info["purpose_defaults"]

# Observed in this turn via CUA; not inferred from disk assertions.
observations = [
    "new_profile_fields_empty",
    "unsaved_close_blocked",
    "copy_parameters_without_key",
    "disable_removes_matching_defaults",
    "recoverable_archive_restore",
    "restored_key_empty",
    "refresh_keys_empty",
    "purpose_switch_updates_automatic_model",
    "manual_choice_survives_purpose_switch",
    "manager_return_preserves_generation_input",
    "task_strip_displays_actual_model",
    "parameter_change_clears_last_test",
    "configuration_search_filters_list",
    "narrow_520px_dialog_fits_width",
    "page_console_no_errors_or_warnings",
]
report = {
    "interface": "source_browser_flow_and_packaged_preview",
    "url": "http://127.0.0.1:4174/",
    "model": "localhost_protocol_fixture_not_a_model",
    "browser_observations": [{"name": name, "passed": True} for name in observations],
    "disk_checks": [{"name": name, "passed": value} for name, value in checks.items()],
    "screenshots": [
        "model-config-management.png",
        "model-purpose-defaults.png",
        "model-generation-choice.png",
        "model-task-provenance.png",
        "model-config-narrow.png",
    ],
}
(ROOT / "docs/verification/model-config-browser.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(
    f"Packaged preview ready; verified {len(checks)} disk checks after CUA observations"
)
