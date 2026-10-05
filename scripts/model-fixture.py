"""Local protocol fixture for verification. This is NOT a language model."""

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        size = int(self.headers.get("content-length", "0"))
        if size > 1_000_000:
            self.send_error(413)
            return
        data = json.loads(self.rfile.read(size))
        content = data["messages"][-1]["content"]
        if content == "连接测试，请只回复 OK。":
            text = "OK"
        else:
            request = json.loads(content)
            name = request["name"]
            if "失败" in name:
                self.send_response(503)
                self.end_headers()
                return
            if "慢速" in request["request"]:
                time.sleep(5)
            actor = request["context"]["actor"]
            actor_id = actor["id"] if actor else None
            if request["kind"] == "character":
                patch = {
                    "name": name,
                    "role": "驿站档案员",
                    "importance": "supporting",
                    "goals": ["整理驿站的补给账目"],
                    "boundary": "不隐瞒已核实的记录",
                    "personality": ["细心", "谨慎"],
                    "voice": "简洁、按记录说话",
                    "story": f"【协议测试示例】{name}负责整理驿站的物资记录，人物故事等待作者补充。",
                    "uncertainties": ["不知道尚未记录的事件"],
                    "tags": ["协议测试"],
                }
            elif request["kind"] == "dialogue":
                patch = {
                    "name": name,
                    "character_id": actor_id,
                    "entry_node_id": "fixture-greeting",
                    "entry_routes": [],
                    "description": "本地协议测试生成的对话示例",
                    "nodes": [
                        {
                            "id": "fixture-greeting",
                            "label": "询问记录",
                            "speaker_id": actor_id,
                            "text": "【协议测试】你要查看已经登记的记录吗？",
                            "options": [
                                {
                                    "id": "fixture-look",
                                    "text": "查看记录",
                                    "target_node_id": "fixture-answer",
                                }
                            ],
                        },
                        {
                            "id": "fixture-answer",
                            "label": "记录答复",
                            "speaker_id": actor_id,
                            "text": "【协议测试】这里仅展示已经核实的记录。",
                            "options": [],
                        },
                    ],
                }
            else:
                patch = {
                    "name": name,
                    "author_id": actor_id,
                    "text_type": "letter",
                    "condition": {"op": "always"},
                    "body": "【协议测试示例】请将已经核实的饮水记录交给值守人员。",
                    "description": "本地测试信件",
                }
            if request["fields"]:
                patch = {k: v for k, v in patch.items() if k in request["fields"]}
            text = json.dumps({"patch": patch}, ensure_ascii=False)
        self.send_response(200)
        self.send_header(
            "Content-Type",
            "text/event-stream" if data.get("stream") else "application/json",
        )
        self.end_headers()
        try:
            if data.get("stream"):
                for start in range(0, len(text), 25):
                    event = {
                        "choices": [{"delta": {"content": text[start : start + 25]}}]
                    }
                    self.wfile.write(
                        (
                            "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"
                        ).encode()
                    )
                    self.wfile.flush()
                    time.sleep(0.02)
                event = {
                    "choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {
                        "prompt_tokens": 32,
                        "completion_tokens": 40,
                        "total_tokens": 72,
                    },
                }
                self.wfile.write(
                    ("data: " + json.dumps(event) + "\n\ndata: [DONE]\n\n").encode()
                )
                self.wfile.flush()
            else:
                self.wfile.write(
                    json.dumps(
                        {
                            "choices": [
                                {"message": {"content": text}, "finish_reason": "stop"}
                            ],
                            "usage": {
                                "prompt_tokens": 32,
                                "completion_tokens": 40,
                                "total_tokens": 72,
                            },
                        },
                        ensure_ascii=False,
                    ).encode()
                )
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    parser = argparse.ArgumentParser(description="Ludo 本地协议测试夹具，非真实模型")
    parser.add_argument("--port", type=int, default=4180)
    args = parser.parse_args()
    print(
        f"Local protocol fixture (NOT a model): http://127.0.0.1:{args.port}/v1",
        flush=True,
    )
    ThreadingHTTPServer(("127.0.0.1", args.port), FixtureHandler).serve_forever()


if __name__ == "__main__":
    main()
