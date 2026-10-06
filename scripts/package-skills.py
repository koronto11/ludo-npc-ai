"""Synchronize self-contained Skill assets and optionally build language ZIPs."""

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def product_version():
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise SystemExit("Expected a semantic product version in package.json")
    backend = (ROOT / "backend/ludo_npc/__init__.py").read_text(encoding="utf-8")
    if f'__version__ = "{version}"' not in backend:
        raise SystemExit("Backend and product versions differ")
    return version


def versioned_skill(text, version, language):
    # Only the generated metadata and version line are updated; instructions stay authored.
    head, body = text.split("\n---\n", 1)
    metadata = f'metadata:\n  version: "{version}"\n  channel: preview'
    if "\nmetadata:" in head:
        head = re.sub(
            r'\nmetadata:\n  version: "[^"]+"\n  channel: preview',
            "\n" + metadata,
            head,
        )
    else:
        head += "\n" + metadata
    line = (
        f"主线版本：**{version} 预览版**，与 NPCs AI Studio 平台版本一致。中英文包能力相同，通常选择一份即可；格式协议版本独立保留。"
        if language == "zh"
        else f"Mainline version: **{version} preview**, aligned with NPCs AI Studio. Both language packs provide the same capabilities; normally choose one. Data protocol versions remain independent."
    )
    if re.search(r"^(主线版本：|Mainline version:).*$", body, re.MULTILINE):
        body = re.sub(
            r"^(主线版本：|Mainline version:).*$", line, body, flags=re.MULTILINE
        )
    else:
        heading, remaining = body.split("\n", 2)[1:]
        body = f"\n{heading}\n\n{line}\n{remaining}"
    return head + "\n---\n" + body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--zip", action="store_true")
    parser.add_argument("--output", type=Path, default=ROOT / "release/skills")
    args = parser.parse_args()
    version = product_version()
    reports = []
    for language in ("zh", "en"):
        name = f"npcs-ai-studio-{language}"
        folder = ROOT / "skills" / name
        skill = folder / "SKILL.md"
        current = skill.read_text(encoding="utf-8")
        expected = versioned_skill(current, version, language)
        if args.check:
            if current != expected:
                raise SystemExit(f"Stale Skill version: {skill}")
        else:
            skill.write_text(expected, encoding="utf-8")
        sources = {
            folder / "scripts/npc_studio_bridge.py": ROOT
            / "backend/ludo_npc/skill_bridge.py",
            folder / "assets/project-v2.schema.json": ROOT
            / "schemas/project-v2.schema.json",
            folder / "assets/storyboard-example.json": ROOT
            / f"docs/examples/skill-storyboard.{language}.json",
            folder / "assets/story-source.md": ROOT
            / f"docs/examples/skill-story-source.{language}.md",
            **{
                folder / f"assets/trial-{state}.json": ROOT
                / f"docs/examples/skill-trial-{state}.json"
                for state in ("healthy", "injured")
            },
        }
        for destination, source in sources.items():
            if args.check:
                if (
                    not destination.exists()
                    or destination.read_bytes() != source.read_bytes()
                ):
                    raise SystemExit(f"Stale Skill asset: {destination}")
            else:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(source.read_bytes())
        if args.zip:
            args.output.mkdir(parents=True, exist_ok=True)
            # Stable download names keep one current artifact per language.
            path = args.output / f"{name}.zip"
            temporary = path.with_suffix(".zip.tmp")
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
                for item in sorted(folder.rglob("*")):
                    if item.is_file() and "__pycache__" not in item.parts:
                        archive.write(item, item.relative_to(folder.parent).as_posix())
            with zipfile.ZipFile(temporary) as archive:
                assert archive.testzip() is None
                assert f"{name}/SKILL.md" in archive.namelist()
            temporary.replace(path)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            path.with_suffix(".zip.sha256").write_text(
                f"{digest}  {path.name}\n", encoding="utf-8"
            )
            reports.append(
                {
                    "path": str(path),
                    "version": version,
                    "channel": "preview",
                    "sha256": digest,
                    "bytes": path.stat().st_size,
                }
            )
    print(
        json.dumps(
            {
                "synchronized": True,
                "version": version,
                "channel": "preview",
                "packages": reports,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
