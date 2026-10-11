import io
import json
import subprocess
import sys
from copy import deepcopy

import pytest

from ludo_npc.agent_tasks import AgentTasks
from ludo_npc.domain.models import Project
from ludo_npc.mcp_server import MCPServer
from ludo_npc.skill_bridge import BridgeError


def prepared(client, document, tmp_path, text=None):
    if text is not None:
        document["content"]["dialogues"][0]["nodes"][0]["text"] = text
    project = client.post("/api/v2/projects/import", json={"document": document}).json()
    prefix = f'/api/v2/projects/{project["project_id"]}'
    save = client.post(prefix + "/save", json={"expected_revision": project["revision"], "path": str(tmp_path / "story.ludo.json")})
    assert save.status_code == 200, save.text
    graph = project["content"]["dialogues"][0]
    body = {"expected_revision": project["revision"], "dialogue_id": graph["id"],
            "node_id": graph["nodes"][0]["id"], "expected_text": graph["nodes"][0]["text"],
            "instruction": "保留人物身份，调整语气"}
    return prefix, body


def mark(client, prefix, body):
    response = client.post(prefix + "/agent-tasks", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def test_mark_read_submit_review_and_adopt(client, document, tmp_path):
    prefix, body = prepared(client, document, tmp_path, "请😀先等巡逻队回来。")
    body.update(start=3, end=8, previous_text="请先等待。")
    before = client.get(prefix).json()
    task = mark(client, prefix, body)
    assert client.get(prefix).json() == before  # Marking is outside project schema/hash.
    assert task["selected_text"] == "等巡逻队回"
    assert task["range"]["unit"] == "unicode_code_point"
    assert task["previous_text"] == "请先等待。"
    assert "initial_state" not in task["context"]
    summary = client.get(prefix + "/agent-tasks").json()[0]
    assert "context" not in summary and "original_text" not in summary
    endpoint = prefix + "/agent-tasks/" + task["id"]
    assert client.get(endpoint).json()["target"]["node_id"] == body["node_id"]
    payload = {"replacement": "等运输队回", "explanation": "保持守卫克制的口吻。"}
    response = client.post(endpoint + "/candidate", json=payload)
    assert response.status_code == 200, response.text
    candidate = response.json()
    assert candidate["status"] == "pending"
    after = client.get(prefix).json()
    assert after["content"]["dialogues"] == before["content"]["dialogues"]
    draft = next(d for d in after["content"]["drafts"] if d["id"] == candidate["draft_id"])
    expected = deepcopy(before["content"]["dialogues"][0]["nodes"])
    expected[0]["text"] = "请😀先等运输队回来。"
    assert draft["patch"] == {"nodes": expected}
    assert draft["model"] == "external-agent / local MCP"
    assert client.post(endpoint + "/candidate", json=payload).json()["draft_id"] == draft["id"]
    assert len(client.get(prefix).json()["content"]["drafts"]) == len(after["content"]["drafts"])
    assert client.post(endpoint + "/candidate", json={"replacement": "不同候选"}).status_code == 422
    review = client.get(prefix + "/drafts/" + draft["id"] + "/review")
    assert review.status_code == 200 and not review.json()["stale"]
    response = client.post(prefix + "/commands", json={"expected_revision": after["revision"], "commands": [
        {"type": "review_draft", "draft_id": draft["id"], "action": "accept",
         "expected_author_hash": review.json()["author_hash"], "values": {"nodes": expected}},
    ]})
    assert response.status_code == 200, response.text
    adopted = response.json()
    assert adopted["content"]["dialogues"][0]["nodes"] == expected
    assert client.get(endpoint).json()["status"] == "accepted"


def test_stale_background_blocks_agent_without_replacing_text(client, document, tmp_path):
    prefix, body = prepared(client, document, tmp_path)
    task = mark(client, prefix, body)
    current = client.get(prefix).json()
    world = current["content"]["world"]
    world["premise"] += "新的背景"
    response = client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": [{"type": "replace_world", "world": world}]})
    assert response.status_code == 200, response.text
    endpoint = prefix + "/agent-tasks/" + task["id"]
    assert client.get(endpoint).json()["status"] == "stale"
    assert client.post(endpoint + "/candidate", json={"replacement": "不应采用"}).status_code == 409
    assert client.get(prefix).json()["content"]["drafts"] == current["content"]["drafts"]


def test_options_cancel_persistence_and_input_guard(client, document, tmp_path):
    prefix, body = prepared(client, document, tmp_path)
    graph = document["content"]["dialogues"][0]
    choice = graph["nodes"][0]["options"][0]
    body.update(option_id=choice["id"], expected_text=choice["text"])
    task = mark(client, prefix, body)
    store = client.app.state.projects
    restored = AgentTasks(store).get(document["project_id"], task["id"])
    assert restored["original_text"] == choice["text"]
    endpoint = prefix + "/agent-tasks/" + task["id"]
    response = client.post(endpoint + "/candidate", json={"replacement": "我愿意帮忙。", "nodes": []})
    assert response.status_code == 422
    response = client.post(endpoint + "/candidate", json={"replacement": "我愿意帮忙。"})
    assert response.status_code == 200, response.text
    saved = client.get(prefix).json()
    nodes = deepcopy(graph["nodes"])
    nodes[0]["options"][0]["text"] = "我愿意帮忙。"
    assert saved["content"]["drafts"][-1]["patch"]["nodes"] == nodes
    second = mark(client, prefix, {**body, "expected_revision": saved["revision"]})
    second_endpoint = prefix + "/agent-tasks/" + second["id"]
    assert client.post(second_endpoint + "/cancel").json()["status"] == "cancelled"
    assert client.post(second_endpoint + "/candidate", json={"replacement": "不应提交"}).status_code == 422
    assert client.get(prefix + "/agent-tasks/missing").status_code == 422
    assert client.post(prefix + "/agent-tasks", json={**body, "expected_revision": saved["revision"], "end": 999999}).status_code == 422
    assert client.post(prefix + "/agent-tasks", json={**body, "expected_revision": saved["revision"], "expected_text": "错误原文"}).status_code == 409
    blocked = client.get(endpoint, headers={"Origin": "https://evil.example"})
    assert blocked.status_code == 403
    config = client.get(prefix + "/agent-connection").json()
    assert config["transport"] == "stdio" and config["args"][-1] == document["project_id"]
    assert "credentials" not in json.dumps(config)


def test_unsaved_and_missing_text_cannot_be_marked(client, document, tmp_path):
    project = client.post("/api/v2/projects/import", json={"document": document}).json()
    graph = project["content"]["dialogues"][0]
    body = {"expected_revision": project["revision"], "dialogue_id": graph["id"], "node_id": graph["nodes"][0]["id"],
            "expected_text": graph["nodes"][0]["text"], "instruction": "润色"}
    prefix = f'/api/v2/projects/{project["project_id"]}'
    assert client.post(prefix + "/agent-tasks", json=body).status_code == 422
    assert client.post(prefix + "/save", json={"expected_revision": project["revision"], "path": str(tmp_path / "saved.ludo.json")}).status_code == 200
    assert client.post(prefix + "/agent-tasks", json={**body, "node_id": "removed-node"}).status_code == 422


def test_failed_candidate_save_is_recoverable_without_duplicate_drafts(client, document, tmp_path, monkeypatch):
    prefix, body = prepared(client, document, tmp_path)
    task = mark(client, prefix, body)
    endpoint = prefix + "/agent-tasks/" + task["id"]
    store = client.app.state.projects
    real_save = store.save

    def fail_save(*args, **kwargs):
        raise OSError("simulated interrupted save")

    monkeypatch.setattr(store, "save", fail_save)
    payload = {"replacement": "运输队还没回来，先别离开营地。"}
    assert client.post(endpoint + "/candidate", json=payload).status_code == 503
    failed = client.get(endpoint).json()
    assert failed["draft_id"] and not failed["submission_saved"]
    count = len(client.get(prefix).json()["content"]["drafts"])
    monkeypatch.setattr(store, "save", real_save)
    recovered = client.post(endpoint + "/candidate", json=payload)
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["draft_id"] == failed["draft_id"]
    assert recovered.json()["submission_saved"]
    assert len(client.get(prefix).json()["content"]["drafts"]) == count
    reopened = Project.model_validate_json((tmp_path / "story.ludo.json").read_text(encoding="utf-8"))
    assert any(row.id == failed["draft_id"] for row in reopened.content.drafts)
    assert reopened.content.dialogues[0].nodes[0].text == body["expected_text"]


def test_repeated_submission_does_not_save_later_author_changes(client, document, tmp_path, monkeypatch):
    prefix, body = prepared(client, document, tmp_path)
    task = mark(client, prefix, body)
    endpoint = prefix + "/agent-tasks/" + task["id"]
    payload = {"replacement": "待在营地里，天亮再走。"}
    candidate = client.post(endpoint + "/candidate", json=payload).json()
    current = client.get(prefix).json()
    world = current["content"]["world"]
    world["premise"] += "作者刚修改的未保存背景"
    changed = client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": [{"type": "replace_world", "world": world}]})
    assert changed.status_code == 200
    store = client.app.state.projects
    assert store.status(document["project_id"])["dirty"]

    def unwanted_save(*args, **kwargs):
        pytest.fail("Duplicate submission must not flush later author work")

    monkeypatch.setattr(store, "save", unwanted_save)
    repeated = client.post(endpoint + "/candidate", json=payload)
    assert repeated.status_code == 200 and repeated.json()["draft_id"] == candidate["draft_id"]
    assert store.status(document["project_id"])["dirty"]
    review = client.get(prefix + "/drafts/" + candidate["draft_id"] + "/review").json()
    assert review["stale"]


def test_launcher_mcp_entrypoint_uses_stdio_without_starting_http_server():
    request = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25"}}
    result = subprocess.run(
        [sys.executable, "-m", "ludo_npc", "--mcp", "--base-url", "http://127.0.0.1:4194", "--project-id", "offline-sample"],
        input=json.dumps(request).encode() + b"\n", capture_output=True, timeout=10,
    )
    assert result.returncode == 0, result.stderr
    response = json.loads(result.stdout)
    assert response["result"]["serverInfo"]["name"] == "npcs-ai-studio"
    assert b"uvicorn" not in result.stdout and b"http://" not in result.stdout


def initialize(server, version="2025-11-25"):
    result = server.dispatch({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": version, "capabilities": {}, "clientInfo": {"name": "test", "version": "1"}}})
    server.dispatch({"jsonrpc": "2.0", "method": "notifications/initialized"})
    return result


def test_mcp_handshake_tools_errors_and_task_read_requirement():
    server = MCPServer("http://127.0.0.1:4174", "sample")
    assert "error" in server.dispatch({"jsonrpc": "2.0", "id": 0, "method": "tools/list"})
    assert initialize(server)["result"]["protocolVersion"] == "2025-11-25"
    listing = server.dispatch({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    tools = listing["result"]["tools"]
    assert {t["name"] for t in tools} == {"npcs_list_tasks", "npcs_get_task", "npcs_submit_candidate"}
    task_id = "agent-task-" + "a" * 32
    with pytest.raises(BridgeError, match="Read this exact"):
        server.call("npcs_submit_candidate", {"task_id": task_id, "replacement": "候选"})
    with pytest.raises(BridgeError):
        server.call("npcs_get_task", {"task_id": "../../credentials"})
    with pytest.raises(BridgeError):
        server.call("npcs_get_task", {"task_id": task_id, "project_id": "another"})
    with pytest.raises(BridgeError):
        server.call("adopt_draft", {})
    assert initialize(MCPServer("http://localhost:4174", "sample"), "future")["result"]["protocolVersion"] == "2025-11-25"


def test_stdio_emits_only_valid_json_and_recovers_after_invalid_input():
    requests = b'bad-json\n' + json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}).encode() + b'\n'
    output = io.BytesIO()
    MCPServer("http://127.0.0.1:4174", "sample").run(io.BytesIO(requests), output)
    messages = [json.loads(line) for line in output.getvalue().splitlines()]
    assert messages[0]["error"]["code"] == -32700
    assert messages[1]["result"]["protocolVersion"] == "2025-06-18"


def card_task(client, document, tmp_path, scope="flow", selected=None):
    graph = document["content"]["dialogues"][0]
    ending = deepcopy(graph["nodes"][-1])
    ending.update(id="closing-node", label="收尾", node_type="ending", text="沿着灯火走。", options=[])
    graph["nodes"].append(ending)
    prefix, body = prepared(client, document, tmp_path)
    body.update(scope=scope, expected_nodes=graph["nodes"], node_ids=selected or [])
    task = mark(client, prefix, body)
    return prefix, task, graph


def submit_cards(client, prefix, task, cards):
    response = client.post(prefix + "/agent-tasks/" + task["id"] + "/candidate", json={"cards": cards})
    assert response.status_code == 200, response.text
    return response.json()


def adopt_card(client, prefix, draft_id, action="accept", nodes=None):
    review = client.get(prefix + "/drafts/" + draft_id + "/review").json()
    current = client.get(prefix).json()
    command = {"type": "review_draft", "draft_id": draft_id, "action": action,
               "expected_author_hash": review["author_hash"]}
    if action == "accept":
        command["values"] = {"nodes": nodes or review["fields"][0]["candidate"]}
    return client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": [command]})


def test_whole_flow_candidates_are_reviewed_per_card_and_keep_all_structure(client, document, tmp_path):
    prefix, task, graph = card_task(client, document, tmp_path)
    assert task["scope"] == "flow" and task["card_count"] == len(graph["nodes"])
    assert task["cards"][-1]["node_type"] == "ending"
    assert task["context"]["dialogue"]["nodes"] == graph["nodes"]
    first = graph["nodes"][0]
    cards = [{"node_id": first["id"], "text": "先在门口等候。",
              "options": [{"option_id": first["options"][0]["id"], "text": "商队何时到达？"}]},
             {"node_id": "closing-node", "text": "跟着灯火走，别偏离道路。"}]
    pending = submit_cards(client, prefix, task, cards)
    assert pending["counts"] == {"pending": 2, "accepted": 0, "rejected": 0}
    assert client.get(prefix).json()["content"]["dialogues"][0] == graph
    assert len(pending["draft_ids"]) == 2
    first_id, second_id = pending["draft_ids"]
    response = adopt_card(client, prefix, first_id)
    assert response.status_code == 200, response.text
    second_review = client.get(prefix + "/drafts/" + second_id + "/review").json()
    assert not second_review["stale"] and not second_review["fields"][0]["conflict"]
    assert second_review["agent_card_id"] == "closing-node"
    response = adopt_card(client, prefix, second_id)
    assert response.status_code == 200, response.text
    expected = deepcopy(graph)
    expected["nodes"][0]["text"] = cards[0]["text"]
    expected["nodes"][0]["options"][0]["text"] = cards[0]["options"][0]["text"]
    expected["nodes"][-1]["text"] = cards[1]["text"]
    assert response.json()["content"]["dialogues"][0] == expected
    refreshed = client.get(prefix + "/agent-tasks/" + task["id"]).json()
    assert refreshed["status"] == "accepted" and refreshed["counts"]["accepted"] == 2
    assert submit_cards(client, prefix, task, cards)["draft_ids"] == pending["draft_ids"]


def test_selected_cards_restrict_writes_even_with_complete_context(client, document, tmp_path):
    first_id = document["content"]["dialogues"][0]["nodes"][0]["id"]
    prefix, task, graph = card_task(client, document, tmp_path, "cards", [first_id, "closing-node"])
    assert [n["id"] for n in task["cards"]] == [first_id, "closing-node"]
    assert len(task["context"]["dialogue"]["nodes"]) > task["card_count"]
    endpoint = prefix + "/agent-tasks/" + task["id"] + "/candidate"
    baseline = client.get(prefix).json()
    for payload in ({"replacement": "不允许"},
                    {"cards": [{"node_id": graph["nodes"][1]["id"], "text": "范围外"}]},
                    {"cards": [{"node_id": first_id, "text": "新的对白", "condition": {"op": "always"}}]},
                    {"cards": [{"node_id": first_id, "text": "1"}, {"node_id": first_id, "text": "2"}]},
                    {"cards": [{"node_id": first_id, "options": [{"option_id": "missing", "text": "不存在"}]}]}):
        assert client.post(endpoint, json=payload).status_code == 422
        assert client.get(prefix).json() == baseline
    pending = submit_cards(client, prefix, task, [{"node_id": first_id, "text": "留在营地。"}, {"node_id": "closing-node", "text": "一路平安。"}])
    assert adopt_card(client, prefix, pending["draft_ids"][0]).status_code == 200
    assert adopt_card(client, prefix, pending["draft_ids"][1], "reject").status_code == 200
    detail = client.get(prefix + "/agent-tasks/" + task["id"]).json()
    assert detail["status"] == "reviewed"
    assert detail["counts"] == {"pending": 0, "accepted": 1, "rejected": 1}
    assert client.get(prefix).json()["content"]["dialogues"][0]["nodes"][-1] == graph["nodes"][-1]


def test_card_review_rejects_topology_and_other_card_edits_even_via_generic_commands(client, document, tmp_path):
    prefix, task, graph = card_task(client, document, tmp_path)
    pending = submit_cards(client, prefix, task, [{"node_id": graph["nodes"][0]["id"], "text": "先等等。"}])
    draft_id = pending["draft_ids"][0]
    review = client.get(prefix + "/drafts/" + draft_id + "/review").json()
    for mutation in ("condition", "target", "other", "speaker", "label", "order"):
        nodes = deepcopy(review["fields"][0]["candidate"])
        if mutation == "condition":
            nodes[0]["options"][0]["condition"] = {"op": "never"}
        elif mutation == "target":
            nodes[0]["options"][0]["target_node_id"] = None
        elif mutation == "other":
            nodes[-1]["text"] = "不能改动其他卡片"
        elif mutation == "speaker":
            nodes[0]["speaker_id"] = None
        elif mutation == "label":
            nodes[0]["label"] = "擅自改标题"
        else:
            nodes.reverse()
        assert adopt_card(client, prefix, draft_id, nodes=nodes).status_code == 422
        current = client.get(prefix).json()
        altered = {**review["draft"], "patch": {"nodes": nodes}}
        response = client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": [{"type": "put_draft", "draft": altered}]})
        assert response.status_code == 422
        assert client.get(prefix).json()["content"]["dialogues"][0] == graph


def test_sibling_adoption_never_hides_later_world_or_same_card_edits(client, document, tmp_path):
    prefix, task, graph = card_task(client, document, tmp_path)
    pending = submit_cards(client, prefix, task, [{"node_id": graph["nodes"][0]["id"], "text": "先等等。"}, {"node_id": "closing-node", "text": "一路平安。"}])
    assert adopt_card(client, prefix, pending["draft_ids"][0]).status_code == 200
    current = client.get(prefix).json()
    world = deepcopy(current["content"]["world"])
    world["premise"] += "新的世界设定。"
    assert client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": [{"type": "replace_world", "world": world}]}).status_code == 200
    second_id = pending["draft_ids"][1]
    review = client.get(prefix + "/drafts/" + second_id + "/review").json()
    assert review["stale"]
    assert adopt_card(client, prefix, second_id).status_code == 422
    current = client.get(prefix).json()
    assert client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": [{"type": "rebase_draft", "draft_id": second_id, "expected_author_hash": review["author_hash"]}]}).status_code == 200
    response = adopt_card(client, prefix, second_id)
    assert response.status_code == 200, response.text
    assert response.json()["content"]["world"] == world
    assert response.json()["content"]["dialogues"][0]["nodes"][0]["text"] == "先等等。"


def test_multi_card_save_failure_retries_exact_drafts_without_auto_adoption(client, document, tmp_path, monkeypatch):
    prefix, task, graph = card_task(client, document, tmp_path)
    endpoint = prefix + "/agent-tasks/" + task["id"] + "/candidate"
    payload = {"cards": [{"node_id": graph["nodes"][0]["id"], "text": "先等等。"}, {"node_id": "closing-node", "text": "一路平安。"}]}
    store = client.app.state.projects
    save = store.save
    monkeypatch.setattr(store, "save", lambda *args, **kwargs: (_ for _ in ()).throw(OSError("interrupted save")))
    assert client.post(endpoint, json=payload).status_code == 503
    failed = client.get(prefix + "/agent-tasks/" + task["id"]).json()
    assert len(failed["draft_ids"]) == 2 and not failed["submission_saved"]
    monkeypatch.setattr(store, "save", save)
    recovered = client.post(endpoint, json=payload)
    assert recovered.status_code == 200, recovered.text
    assert recovered.json()["draft_ids"] == failed["draft_ids"]
    assert recovered.json()["submission_saved"]
    assert client.get(prefix).json()["content"]["dialogues"][0] == graph


def test_mcp_accepts_structured_cards_only_after_read_and_rejects_structure():
    server = MCPServer("http://127.0.0.1:4194", "sample")
    initialize(server)
    task_id = "agent-task-" + "b" * 32

    class FakeAPI:
        def request(self, path, body=None):
            return {"path": path, "body": body}

    server.api = FakeAPI()
    with pytest.raises(BridgeError, match="Read this exact"):
        server.call("npcs_submit_candidate", {"task_id": task_id, "cards": [{"node_id": "node-a", "text": "你好"}]})
    server.call("npcs_get_task", {"task_id": task_id})
    result = server.call("npcs_submit_candidate", {"task_id": task_id, "cards": [{"node_id": "node-a", "text": "你好"}]})
    assert result["body"]["cards"][0]["text"] == "你好"
    with pytest.raises(BridgeError):
        server.call("npcs_submit_candidate", {"task_id": task_id, "cards": [{"node_id": "node-a", "target_node_id": "evil"}]})


def test_bulk_card_adoption_merges_each_card_in_one_transaction(client, document, tmp_path):
    prefix, task, graph = card_task(client, document, tmp_path)
    cards = [{"node_id": graph["nodes"][0]["id"], "text": "先在这里等候。"}, {"node_id": "closing-node", "text": "祝你平安。"}]
    pending = submit_cards(client, prefix, task, cards)
    reviews = [client.get(prefix + "/drafts/" + identity + "/review").json() for identity in pending["draft_ids"]]
    current = client.get(prefix).json()
    commands = [{"type": "review_draft", "draft_id": r["draft"]["id"], "action": "accept", "expected_author_hash": r["author_hash"], "values": {"nodes": r["fields"][0]["candidate"]}} for r in reviews]
    response = client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": commands})
    assert response.status_code == 200, response.text
    nodes = response.json()["content"]["dialogues"][0]["nodes"]
    assert nodes[0]["text"] == cards[0]["text"] and nodes[-1]["text"] == cards[1]["text"]
    assert nodes[1] == graph["nodes"][1]


def test_edited_at_adoption_sibling_is_proven_but_later_same_card_edit_conflicts(client, document, tmp_path):
    prefix, task, graph = card_task(client, document, tmp_path)
    pending = submit_cards(client, prefix, task, [{"node_id": graph["nodes"][0]["id"], "text": "先等候。"}, {"node_id": "closing-node", "text": "一路平安。"}])
    first_id, second_id = pending["draft_ids"]
    review = client.get(prefix + "/drafts/" + first_id + "/review").json()
    edited = deepcopy(review["fields"][0]["candidate"])
    edited[0]["text"] = "在门口等一会儿。"
    assert adopt_card(client, prefix, first_id, nodes=edited).status_code == 200
    second_review = client.get(prefix + "/drafts/" + second_id + "/review").json()
    assert not second_review["stale"]
    current = client.get(prefix).json()
    nodes = deepcopy(current["content"]["dialogues"][0]["nodes"])
    nodes[-1]["text"] = "作者手动修改后的收尾。"
    response = client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": [{"type": "patch_entity", "target": {"kind": "dialogue", "id": graph["id"]}, "changes": {"nodes": nodes}}]})
    assert response.status_code == 200, response.text
    second_review = client.get(prefix + "/drafts/" + second_id + "/review").json()
    assert second_review["stale"] and second_review["fields"][0]["conflict"]
    assert adopt_card(client, prefix, second_id).status_code == 422
    assert client.get(prefix).json()["content"]["dialogues"][0]["nodes"][-1]["text"] == "作者手动修改后的收尾。"


def test_task_delete_restore_is_persistent_and_blocks_late_agent_submission(client, document, tmp_path):
    prefix, body = prepared(client, document, tmp_path)
    task = mark(client, prefix, body)
    endpoint = prefix + "/agent-tasks/" + task["id"]
    before = client.get(prefix).json()
    assert client.delete(endpoint).json() == {"id": task["id"], "deleted": True}
    assert client.delete(endpoint).status_code == 200  # Retry, no duplicate archive.
    assert client.get(prefix + "/agent-tasks").json() == []
    assert client.get(endpoint).status_code == 422
    assert client.post(endpoint + "/candidate", json={"replacement": "删除后不应提交"}).status_code == 422
    assert client.get(prefix).json() == before
    store = client.app.state.projects
    restarted = AgentTasks(store)
    deleted = restarted.deleted(document["project_id"])
    assert len(deleted) == 1 and deleted[0]["id"] == task["id"] and deleted[0]["deleted_at"]
    restored = client.post(endpoint + "/restore")
    assert restored.status_code == 200 and restored.json() == task
    assert client.post(endpoint + "/restore").json() == task
    assert restarted.deleted(document["project_id"]) == []
    assert client.get(prefix).json() == before
    assert client.delete(prefix + "/agent-tasks/../../credentials").status_code != 200


def test_deleting_reviewed_or_pending_flow_retains_all_drafts_and_adopted_content(client, document, tmp_path):
    prefix, task, graph = card_task(client, document, tmp_path)
    pending = submit_cards(client, prefix, task, [{"node_id": graph["nodes"][0]["id"], "text": "请在门前等候。"},
                                                 {"node_id": "closing-node", "text": "旅途平安。"}])
    assert adopt_card(client, prefix, pending["draft_ids"][0]).status_code == 200
    before = client.get(prefix).json()
    endpoint = prefix + "/agent-tasks/" + task["id"]
    assert client.delete(endpoint).status_code == 200
    assert client.get(prefix).json() == before
    deleted = client.get(prefix + "/agent-tasks?deleted=true").json()[0]
    assert deleted["counts"] == {"pending": 1, "accepted": 1, "rejected": 0}
    # The independent pending candidate remains reviewable, even while its task is deleted.
    assert adopt_card(client, prefix, pending["draft_ids"][1]).status_code == 200
    restored = client.post(endpoint + "/restore").json()
    assert restored["counts"] == {"pending": 0, "accepted": 2, "rejected": 0}
    nodes = client.get(prefix).json()["content"]["dialogues"][0]["nodes"]
    assert nodes[0]["text"] == "请在门前等候。" and nodes[-1]["text"] == "旅途平安。"


def test_task_archive_write_failures_preserve_active_or_recoverable_task(client, document, tmp_path, monkeypatch):
    prefix, body = prepared(client, document, tmp_path)
    task = mark(client, prefix, body)
    tasks = AgentTasks(client.app.state.projects)
    project_id = document["project_id"]
    write = tasks.write

    def fail_write(*args):
        raise OSError("interrupted queue write")

    monkeypatch.setattr(tasks, "write", fail_write)
    with pytest.raises(OSError):
        tasks.delete(project_id, task["id"])
    assert tasks.get(project_id, task["id"]) == task
    assert tasks.deleted(project_id) == []  # Archive copy cannot hide an active row.
    monkeypatch.setattr(tasks, "write", write)
    tasks.delete(project_id, task["id"])
    monkeypatch.setattr(tasks, "write", fail_write)
    with pytest.raises(OSError):
        tasks.restore(project_id, task["id"])
    assert tasks.list(project_id) == [] and len(tasks.deleted(project_id)) == 1
    monkeypatch.setattr(tasks, "write", write)
    assert tasks.restore(project_id, task["id"]) == task
    assert tasks.deleted(project_id) == []


def test_deleted_task_frees_active_capacity_and_restore_limit_preserves_archive(client, document, tmp_path):
    prefix, body = prepared(client, document, tmp_path)
    task = mark(client, prefix, body)
    project_id = document["project_id"]
    tasks = AgentTasks(client.app.state.projects)
    first = tasks.records(project_id)[0]
    tasks.write(project_id, [first, *[first.model_copy(update={"id": "agent-task-" + f"{i:032x}"}) for i in range(99)]])
    endpoint = prefix + "/agent-tasks/" + task["id"]
    assert client.post(prefix + "/agent-tasks", json=body).status_code == 422
    assert client.delete(endpoint).status_code == 200
    mark(client, prefix, body)
    assert len(tasks.list(project_id)) == 100

    assert client.post(endpoint + "/restore").status_code == 422
    assert len(tasks.deleted(project_id)) == 1
    assert client.delete(prefix + "/agent-tasks/" + tasks.list(project_id)[0]["id"]).status_code == 200
    assert client.post(endpoint + "/restore").status_code == 200
    assert len(tasks.list(project_id)) == 100


def test_restore_retains_creation_order_and_does_not_bypass_author_staleness(client, document, tmp_path):
    prefix, body = prepared(client, document, tmp_path)
    first = mark(client, prefix, body)
    second = mark(client, prefix, body)
    endpoint = prefix + "/agent-tasks/" + first["id"]
    assert client.delete(endpoint).status_code == 200
    current = client.get(prefix).json()
    world = current["content"]["world"]
    world["premise"] += "作者修改后的背景"
    assert client.post(prefix + "/commands", json={"expected_revision": current["revision"], "commands": [
        {"type": "replace_world", "world": world},
    ]}).status_code == 200
    before_restore = client.get(prefix).json()
    restored = client.post(endpoint + "/restore")
    assert restored.status_code == 200 and restored.json()["status"] == "stale"
    assert [row["id"] for row in client.get(prefix + "/agent-tasks").json()] == [second["id"], first["id"]]
    assert client.post(endpoint + "/candidate", json={"replacement": "旧背景不应提交"}).status_code == 409
    assert client.get(prefix).json() == before_restore
