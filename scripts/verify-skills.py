"""Run the distributed Skill helpers against an isolated real local service."""

import argparse
import importlib.util
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AREA = ROOT / ".local-build/skill-verification" / str(time.time_ns())
SPEC = importlib.util.spec_from_file_location(
    "bridge", ROOT / "backend/ludo_npc/skill_bridge.py"
)
bridge = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bridge)
checks = []
EXE = None


def cli(language, base, *args, success=True):
    helper = ROOT / f"skills/npcs-ai-studio-{language}/scripts/npc_studio_bridge.py"
    program = [str(EXE), "--skill-bridge"] if EXE else [sys.executable, str(helper)]
    result = subprocess.run(
        [*program, "--base-url", base, *map(str, args)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=45,
        check=False,
    )
    assert (result.returncode == 0) == success, result.stderr
    checks.append(f"{language}_{args[0]}_{'ok' if success else 'refused'}")


def main():
    global EXE
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", type=Path)
    args = parser.parse_args()
    EXE = args.exe.resolve() if args.exe else None
    AREA.mkdir(parents=True)
    projects = AREA / "中文 工程"
    projects.mkdir()
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    log = (AREA / "server.log").open("w", encoding="utf-8")
    program = [str(EXE)] if EXE else [sys.executable, "-m", "ludo_npc"]
    process = subprocess.Popen(
        [
            *program,
            "--port",
            str(port),
            "--no-browser",
            "--data-dir",
            str(AREA / "app"),
            "--project-dir",
            str(projects),
        ],
        cwd=ROOT,
        stdout=log,
        stderr=subprocess.STDOUT,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    try:
        api = None
        for _ in range(150):
            assert process.poll() is None, (
                "Service startup failed; inspect isolated log."
            )
            try:
                api = bridge.LocalAPI(base)
                break
            except bridge.BridgeError:
                time.sleep(0.05)
        assert api is not None
        for language in ("zh", "en"):
            folder = ROOT / f"skills/npcs-ai-studio-{language}"
            candidate = AREA / f"{language}-candidate.ludo.json"
            destination = projects / f"{language} 潮汐故事.ludo.json"
            cli(
                language,
                base,
                "compile",
                "--input",
                folder / "assets/storyboard-example.json",
                "--output",
                candidate,
            )
            cli(language, base, "validate", "--input", candidate)
            cli(
                language,
                base,
                "import",
                "--input",
                candidate,
                "--destination",
                destination,
            )
            assert not destination.exists()
            pid = bridge.read_json(candidate)["project_id"]
            assert pid not in {p["project_id"] for p in api.request("/api/v2/projects")}
            cli(
                language,
                base,
                "import",
                "--input",
                candidate,
                "--destination",
                destination,
                "--apply",
            )
            assert destination.is_file()
            cli(
                language,
                base,
                "import",
                "--input",
                candidate,
                "--destination",
                destination,
                "--apply",
                success=False,
            )
            cli(
                language,
                base,
                "compile",
                "--input",
                folder / "assets/storyboard-example.json",
                "--output",
                candidate,
                success=False,
            )
            cli(language, base, "list")
            snapshot = AREA / f"{language}-snapshot.json"
            cli(language, base, "inspect", "--project-id", pid, "--output", snapshot)
            context = bridge.read_json(snapshot)
            project = context["project"]
            original_story = project["content"]["characters"][0]["story"]
            for state in ("healthy", "injured"):
                result_path = AREA / f"{language}-trial-{state}.json"
                cli(
                    language,
                    base,
                    "simulate",
                    "--project-id",
                    pid,
                    "--input",
                    folder / f"assets/trial-{state}.json",
                    "--output",
                    result_path,
                )
                result = bridge.read_json(result_path)
                assert result["complete"] and not result["diagnostics"]
                assert result["state"]["variables"]["var-trust"] == (state == "injured")
            proposal_path = AREA / f"{language}-proposal.json"
            proposal = {
                "format": "ludo-draft-proposal",
                "version": 1,
                "project_id": pid,
                "expected_revision": project["revision"],
                "expected_author_hash": context["author_hash"],
                "changes": [
                    {
                        "target": {"kind": "character", "id": "char-healer"},
                        "name": "外部 AI 故事候选"
                        if language == "zh"
                        else "External AI story candidate",
                        "patch": {
                            "story": "示例：她每晚记录旅人的伤势，绝不泄露他人的秘密。"
                            if language == "zh"
                            else "Example: she records wounds and keeps travelers secrets."
                        },
                    }
                ],
            }
            bridge.write_json(proposal_path, proposal)
            cli(language, base, "draft", "--project-id", pid, "--input", proposal_path)
            assert not api.project(pid)["content"]["drafts"]
            cli(
                language,
                base,
                "draft",
                "--project-id",
                pid,
                "--input",
                proposal_path,
                "--apply",
            )
            updated = api.project(pid)
            assert updated["content"]["characters"][0]["story"] == original_story
            assert len(updated["content"]["drafts"]) == 1
            draft_id = updated["content"]["drafts"][0]["id"]
            review = api.request(f"/api/v2/projects/{pid}/drafts/{draft_id}/review")
            assert not review["stale"]
            checks.append(f"{language}_pending_draft_preserves_formal_story")
            cli(
                language,
                base,
                "draft",
                "--project-id",
                pid,
                "--input",
                proposal_path,
                "--apply",
                success=False,
            )
            assert len(api.project(pid)["content"]["drafts"]) == 1
            accepted = api.request(
                f"/api/v2/projects/{pid}/commands",
                {
                    "expected_revision": updated["revision"],
                    "commands": [
                        {
                            "type": "review_draft",
                            "draft_id": draft_id,
                            "action": "accept",
                            "expected_author_hash": review["author_hash"],
                            "values": proposal["changes"][0]["patch"],
                        }
                    ],
                },
            )
            api.request(
                f"/api/v2/projects/{pid}/save",
                {"expected_revision": accepted["revision"]},
            )
            assert (
                bridge.read_json(destination)["content"]["characters"][0]["story"]
                == proposal["changes"][0]["patch"]["story"]
            )
            checks.append(f"{language}_adopt_and_save")
        report = {
            "transport": "real_http_packaged_service_and_exe_bridge"
            if EXE
            else "real_http_source_service_and_distributed_cli",
            "real_models": False,
            "area": str(AREA),
            "passed": len(checks),
            "checks": checks,
        }
        path = ROOT / (
            "docs/verification/skills-windows-report.json"
            if EXE
            else "docs/verification/skills-report.json"
        )
        path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(report, ensure_ascii=False))
    finally:
        process.terminate()
        process.wait(timeout=10)
        log.close()


if __name__ == "__main__":
    main()
