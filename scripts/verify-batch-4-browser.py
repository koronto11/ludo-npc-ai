"""Audit files produced by the recorded browser workflow; no browser automation here."""

import json
from pathlib import Path

from ludo_npc.domain.models import Project
from ludo_npc.drafts import review
from ludo_npc.simulation import SimulationInput, rehearse

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / ".local-projects/第四批-生成审核验证.ludo.json"
project = Project.model_validate_json(PATH.read_text(encoding="utf-8"))
data = project.model_dump(mode="json")
content = data["content"]
report = {
    "method": "recorded_cua_browser_actions_plus_local_file_audit",
    "model": "localhost_protocol_fixture_not_a_model",
    "project": PATH.name,
    "revision": project.revision,
    "browser_observations": [
        "Connection test and streaming/JSON profile saved via UI, no real credential entered.",
        "Name and role were disabled as confirmed in existing-character generation.",
        "New manual goal made pending story stale and disabled acceptance; explicit comparison restored acceptance.",
        "Candidate story edited and saved separately, then selected story field accepted.",
        "Five generated cards left formal count at one until atomic acceptance changed it to six.",
        "Generated dialogue option reached answer node; choice branch saved via UI.",
        "Generated letter accepted and shown as available non-dialogue text.",
        "Final Windows package reopened the saved project and pending story comparison; current tab warning/error log empty.",
    ],
    "screenshots": [
        "screenshots/batch-4-draft-review.png",
        "screenshots/batch-4-generated-dialogue.png",
    ],
    "file_checks": [],
}


def check(name, value):
    assert value, name
    report["file_checks"].append({"name": name, "passed": True})


actor = next(c for c in content["characters"] if c["id"] == "keeper")
check("six_formal_characters", len(content["characters"]) == 6)
check(
    "confirmed_name_and_role_preserved",
    actor["name"] == "夏岚"
    and actor["role"] == "驿站守门人"
    and set(actor["confirmed_fields"]) == {"name", "role"},
)
check(
    "manual_goal_preserved",
    actor["goals"] == ["保护驿站，优先核实补给记录（人工编辑）"],
)
check(
    "edited_and_accepted_story",
    actor["story"] == "夏岚曾负责驿站账目，她坚持只向访客解释已经核实的补给记录。"
    and any(
        d["status"] == "accepted"
        and d["applied_fields"] == ["story"]
        and d["base_content_revision"] == 8
        and d["patch"]["story"] == actor["story"]
        for d in content["drafts"]
    ),
)
check(
    "five_new_character_drafts_accepted",
    len(
        [
            d
            for d in content["drafts"]
            if d["operation"] == "create"
            and d["target"]["kind"] == "character"
            and d["status"] == "accepted"
        ]
    )
    == 5,
)
check(
    "sample_draft_rejected",
    next(d for d in content["drafts"] if d["id"] == "keeper-story-draft")["status"]
    == "rejected",
)
graph = next(g for g in content["dialogues"] if g["name"] == "补给记录询问")
check(
    "generated_dialogue_reference_and_option",
    graph["character_id"] == "keeper"
    and len(graph["nodes"]) == 2
    and graph["nodes"][0]["options"][0]["target_node_id"] == "fixture-answer",
)
case = next(c for c in content["simulation_cases"] if c["name"] == "生成对话预演")
check(
    "generated_choice_saved",
    any(
        c["dialogue_id"] == graph["id"] and c["option_id"] == "fixture-look"
        for c in case["choices"]
    ),
)
result = rehearse(
    project,
    SimulationInput(
        expected_content_revision=project.content_revision, case_id=case["id"]
    ),
)
check(
    "reopened_replay_reaches_answer",
    result["complete"]
    and any(
        g["id"] == graph["id"] and g["node_id"] == "fixture-answer"
        for g in result["dialogues"]
    ),
)
letter = next(t for t in content["texts"] if t["name"] == "值守记录信件")
check(
    "generated_letter_persisted",
    letter["author_id"] == "keeper"
    and letter["text_type"] == "letter"
    and "协议测试示例" in letter["body"],
)
pending = [d for d in content["drafts"] if d["status"] == "pending"]
check(
    "pending_comparison_survives_restart",
    len(pending) == 1
    and not review(project, pending[0]["id"])["stale"]
    and pending[0]["patch"]["story"] != actor["story"],
)
check(
    "all_generation_task_results_persisted",
    len(content["generation_history"]) == 5
    and sum(g["total"] for g in content["generation_history"]) == 9
    and all(
        g["finished"] == g["total"] and g["items"]
        for g in content["generation_history"]
    ),
)
check(
    "screenshots_exist",
    all((ROOT / "docs" / name).is_file() for name in report["screenshots"]),
)
(ROOT / "docs/verification/batch-4-browser.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"Passed {len(report['file_checks'])} browser workflow file checks")
