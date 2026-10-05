"""Generate contracts/samples or explicitly migrate a chosen document."""

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from .api.app import create_app
from .application.commands import CommandBatch
from .domain.models import Project
from .migration import DocumentError, dump_project, load_document
from .samples import outpost_project


def read_document(path: Path) -> dict:
    def unique_object(pairs):
        data = {}
        for key, value in pairs:
            if key in data:
                raise DocumentError(f"JSON 字段重复: {key}")
            data[key] = value
        return data

    def nonfinite(value):
        raise DocumentError("JSON 不允许 NaN 或 Infinity")

    if path.stat().st_size > 20_000_000:
        raise DocumentError("项目文件超过 20 MB")
    data = json.loads(
        path.read_text(encoding="utf-8-sig"),
        object_pairs_hook=unique_object,
        parse_constant=nonfinite,
    )
    if not isinstance(data, dict):
        raise DocumentError("项目必须是 JSON 对象")
    return data


def json_text(data):
    return json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def generated_artifacts(root: Path) -> dict[Path, str]:
    timestamp = datetime(2026, 10, 5, tzinfo=UTC)
    blank = Project(project_id="sample-blank", name="空白叙事项目")
    migrated = load_document(read_document(root / "docs/examples/lighthouse.ludo.json"))
    outpost = outpost_project()
    for project in (blank, migrated, outpost):
        project.metadata.created_at = timestamp
        project.metadata.updated_at = timestamp
    return {
        root / "schemas/project-v2.schema.json": json_text(Project.model_json_schema()),
        root / "schemas/commands-v2.schema.json": json_text(CommandBatch.model_json_schema()),
        root / "schemas/openapi.json": json_text(create_app().openapi()),
        root / "docs/examples/blank-v2.ludo.json": dump_project(blank),
        root / "docs/examples/lighthouse-v2.ludo.json": dump_project(migrated),
        root / "docs/examples/outpost-v2.ludo.json": dump_project(outpost),
    }


def main():
    parser = argparse.ArgumentParser(description="Ludo v2 契约和迁移工具")
    commands = parser.add_subparsers(dest="command", required=True)
    contracts = commands.add_parser("generate", help="生成可审阅的 Schema 与示例")
    contracts.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    contracts.add_argument("--check", action="store_true")
    migrate = commands.add_parser("migrate", help="迁移指定 JSON 到一个新文件，不覆盖原文件")
    migrate.add_argument("source", type=Path)
    migrate.add_argument("destination", type=Path)
    args = parser.parse_args()
    if args.command == "migrate":
        project = load_document(read_document(args.source))
        with args.destination.open("x", encoding="utf-8", newline="\n") as output:
            output.write(dump_project(project))
        print("Migrated:", args.destination)
        return
    artifacts = generated_artifacts(args.root.resolve())
    stale = []
    for path, content in artifacts.items():
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                stale.append(str(path))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    if stale:
        parser.exit(1, "Outdated generated files:\n" + "\n".join(stale) + "\n")
    print(f"{'Checked' if args.check else 'Generated'} {len(artifacts)} contract/sample files")


if __name__ == "__main__":
    main()
