"""Repeatable offline capacity measurements; writes only to a workspace fixture area."""

# Ruff B023: measurements invoke each callable synchronously before the loop advances.
# ruff: noqa: B023

import json
import statistics
import time
from pathlib import Path

from ludo_npc.application.commands import CommandBatch
from ludo_npc.domain.models import Project
from ludo_npc.exports import ExportRequest, build_export
from ludo_npc.simulation import SimulationInput, rehearse
from ludo_npc.storage import LocalProjects

ROOT = Path(__file__).resolve().parents[1]
AREA = ROOT / ".local-build/capacity-verification"


def fixture(count):
    chars = [
        {
            "kind": "character",
            "id": f"actor-{i}",
            "name": f"居民 {i:04}",
            "role": "村民",
            "story": "这位居民生活在小镇，平时照料自己的生计。" * 8,
            "tags": [f"分组{i % 10}"],
        }
        for i in range(count)
    ]
    dialogues = [
        {
            "kind": "dialogue",
            "id": f"graph-{i}",
            "name": f"居民{i}闲聊",
            "character_id": f"actor-{i}",
            "entry_node_id": "n0",
            "nodes": [
                {
                    "id": f"n{j}",
                    "label": f"话题{j}",
                    "text": "今天的天气不错，等会儿打算去河边转转。" * 3,
                    "speaker_id": f"actor-{i}",
                    "options": [
                        {
                            "id": f"o{j}",
                            "text": "接着说吧。",
                            "target_node_id": f"n{j + 1}" if j < 3 else None,
                        }
                    ],
                }
                for j in range(4)
            ],
        }
        for i in range(count)
    ]
    return Project.model_validate(
        {
            "project_id": f"capacity-{count}",
            "name": f"容量验证 · {count} 人物",
            "content": {
                "characters": chars,
                "dialogues": dialogues,
                "locations": [{"kind": "location", "id": "town", "name": "小镇"}],
                "levels": [
                    {
                        "id": "level",
                        "name": "小镇一日",
                        "tracks": [
                            {"id": "track", "name": "街道", "location_id": "town"}
                        ],
                        "appearances": [
                            {
                                "id": f"appearance-{i}",
                                "character_id": f"actor-{i}",
                                "track_id": "track",
                                "start_tick": i % 100,
                                "end_tick": i % 100 + 30,
                                "dialogue_ids": [f"graph-{i}"],
                            }
                            for i in range(count)
                        ],
                    }
                ],
            },
        }
    )


def timed(fn, repeat=3):
    samples = []
    result = None
    for _ in range(repeat):
        started = time.perf_counter()
        result = fn()
        samples.append(round((time.perf_counter() - started) * 1000, 2))
    return result, {
        "median_ms": statistics.median(samples),
        "max_ms": max(samples),
        "samples_ms": samples,
    }


def main():
    AREA.mkdir(parents=True, exist_ok=True)
    report = {"transport": "offline_local_store", "real_models": False, "sizes": []}
    for count in (100, 500, 1500):
        project, construct = timed(lambda: fixture(count))
        folder = AREA / str(count)
        store = LocalProjects(folder / "app", folder / "projects")
        try:
            store.add(project)
            path = folder / "projects" / f"capacity-{time.time_ns()}.ludo.json"
            _, save = timed(
                lambda: store.save(
                    project.project_id,
                    store.get(project.project_id).revision,
                    str(path),
                ),
                repeat=1,
            )
            _, validate = timed(lambda: Project.model_validate_json(path.read_bytes()))

            def edit():
                current = store.get(project.project_id)
                changed = store.apply(
                    project.project_id,
                    CommandBatch(
                        expected_revision=current.revision,
                        commands=[
                            {
                                "type": "patch_entity",
                                "target": {"kind": "character", "id": "actor-0"},
                                "changes": {
                                    "story": f"容量测试编辑 {current.revision}"
                                },
                            }
                        ],
                    ),
                )
                store.save(changed.project_id, changed.revision)
                return changed

            latest, editing = timed(edit)
            _, undo = timed(
                lambda: store.undo_edit(
                    project.project_id, store.get(project.project_id).revision, "undo"
                )
            )
            latest = store.get(project.project_id)
            _, simulation = timed(
                lambda: rehearse(
                    latest,
                    SimulationInput(
                        expected_content_revision=latest.content_revision,
                        level_id="level",
                        location_id="town",
                        at_tick=20,
                    ),
                )
            )
            _, csv = timed(
                lambda: build_export(
                    latest,
                    ExportRequest(
                        expected_revision=latest.revision,
                        format="csv",
                        level_id="level",
                    ),
                )
            )
            _, md = timed(
                lambda: build_export(
                    latest,
                    ExportRequest(
                        expected_revision=latest.revision,
                        format="markdown",
                        level_id="level",
                    ),
                )
            )
            row = {
                "characters": count,
                "dialogues": count,
                "nodes": count * 4,
                "appearances": count,
                "bytes": path.stat().st_size,
                "construct": construct,
                "open_validate": validate,
                "first_save": save,
                "edit_and_save": editing,
                "undo": undo,
                "simulation": simulation,
                "csv": csv,
                "markdown": md,
            }
            report["sizes"].append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
            if count == 500:
                (AREA / "browser-fixture.ludo.json").write_text(
                    latest.model_dump_json(), encoding="utf-8"
                )
        finally:
            store.shutdown()
    target = ROOT / "docs/verification/capacity-report.json"
    target.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
