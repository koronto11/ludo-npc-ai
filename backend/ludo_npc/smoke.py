"""Exercise a running loopback server; record results without cookies or tokens."""

import argparse
import json
from pathlib import Path

import httpx2 as httpx

from .domain.models import Project, utc_now
from .samples import outpost_project


def main():
    parser = argparse.ArgumentParser(description="实际 HTTP 验证（创建一个内存示例，不落盘项目）")
    parser.add_argument("--port", type=int, default=4174)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = {"checked_at": utc_now().isoformat(), "transport": "real_loopback_http", "checks": []}

    def checked(name, response, expected):
        assert response.status_code == expected, f"{name}: {response.status_code}"
        report["checks"].append({"name": name, "status": response.status_code, "passed": True})

    with httpx.Client(base_url=f"http://127.0.0.1:{args.port}", trust_env=False) as client:
        health = client.get("/api/health")
        checked("health", health, 200)
        report["capabilities"] = health.json()
        checked("local_session", client.get("/start"), 303)
        created = client.post("/api/v2/projects", json={"name": "实际 HTTP 验证"})
        checked("create_blank", created, 201)
        identifier = created.json()["project_id"]
        command = {
            "expected_revision": 1,
            "commands": [
                {
                    "type": "create_entity",
                    "entity": {"kind": "character", "id": "http-character", "name": "独立角色"},
                }
            ],
        }
        checked(
            "edit_character",
            client.post(f"/api/v2/projects/{identifier}/commands", json=command),
            200,
        )
        checked(
            "stale_revision",
            client.post(f"/api/v2/projects/{identifier}/commands", json=command),
            409,
        )
        rejected = {
            "expected_revision": 2,
            "commands": [
                {"type": "rename_project", "name": "不应生效"},
                {
                    "type": "put_relation",
                    "relation": {
                        "id": "broken",
                        "source": {"kind": "character", "id": "http-character"},
                        "target": {"kind": "location", "id": "missing"},
                        "label": "错误",
                    },
                },
            ],
        }
        checked(
            "atomic_invalid_batch",
            client.post(f"/api/v2/projects/{identifier}/commands", json=rejected),
            422,
        )
        exported = client.get(f"/api/v2/projects/{identifier}/export")
        checked("export_valid_project", exported, 200)
        project = Project.model_validate(exported.json())
        assert project.revision == 2 and project.name == "实际 HTTP 验证"
        sample = outpost_project()
        sample.project_id = identifier + "-outpost"
        imported = client.post(
            "/api/v2/projects/import", json={"document": sample.model_dump(mode="json")}
        )
        checked("independent_world_import", imported, 201)
        roundtrip = client.get(f"/api/v2/projects/{sample.project_id}/export")
        checked("independent_world_export", roundtrip, 200)
        assert Project.model_validate(roundtrip.json()) == sample
        checked(
            "foreign_origin_rejected",
            client.post("/api/v2/projects", json={}, headers={"Origin": "https://outside.example"}),
            403,
        )
        checked("frontend_prototype_available", client.get("http://127.0.0.1:4173/"), 200)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(f"Passed {len(report['checks'])} real HTTP checks")


if __name__ == "__main__":
    main()
