import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ludo_npc.api.app import create_app
from ludo_npc.samples import outpost_project

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def document():
    return outpost_project().model_dump(mode="json")


@pytest.fixture
def legacy():
    return json.loads((ROOT / "docs/examples/lighthouse.ludo.json").read_text(encoding="utf-8"))


@pytest.fixture
def client(tmp_path):
    with TestClient(
        create_app(data_dir=tmp_path / "app", project_dir=tmp_path / "projects")
    ) as client:
        client.get("/start")
        yield client
