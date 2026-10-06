"""NPCs AI Studio author-assistant bridge. Python 3.10+, standard library only.

Canonical source; scripts/package-skills.py copies this into both language packs.
Never calls a model, accepts credentials, or automatically retries a write.
"""

import argparse
import copy
import http.cookiejar
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

COLLECTIONS = {
    "character": "characters",
    "location": "locations",
    "faction": "factions",
    "fact": "facts",
    "variable": "variables",
    "event": "events",
    "rule": "rules",
    "dialogue": "dialogues",
    "text": "texts",
}
CONTENT_KEYS = {*COLLECTIONS.values(), "relations", "levels", "world", "initial_state"}
LIMIT = 20_000_000


class BridgeError(Exception):
    pass


def read_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise BridgeError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    def invalid(value):
        raise BridgeError(f"Invalid JSON number: {value}")

    path = Path(path)
    if path.stat().st_size > LIMIT:
        raise BridgeError("Input exceeds 20 MB.")
    result = json.loads(
        path.read_text(encoding="utf-8-sig"),
        object_pairs_hook=unique,
        parse_constant=invalid,
    )
    if not isinstance(result, dict):
        raise BridgeError("Input must be a JSON object.")
    return result


def write_json(path, value):
    with Path(path).open("x", encoding="utf-8", newline="\n") as output:
        json.dump(value, output, ensure_ascii=False, indent=2, allow_nan=False)
        output.write("\n")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise BridgeError("Redirect refused; use the local service URL directly.")


class LocalAPI:
    def __init__(self, base):
        parsed = urllib.parse.urlsplit(base)
        if (
            parsed.scheme != "http"
            or parsed.hostname not in {"127.0.0.1", "localhost"}
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in {"", "/"}
        ):
            raise BridgeError("Use http://127.0.0.1:PORT or http://localhost:PORT only.")
        try:
            port = parsed.port
            if port is not None and not 1 <= port <= 65535:
                raise ValueError("port out of range")
        except ValueError as error:
            raise BridgeError("Invalid local port.") from error
        self.base = base.rstrip("/")
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            NoRedirect(),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        )
        self.request("/api/session")

    def request(self, path, data=None):
        encoded = None if data is None else json.dumps(data, allow_nan=False).encode("utf-8")
        request = urllib.request.Request(
            self.base + path, data=encoded, headers={"Content-Type": "application/json"}
        )
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = ""
            try:
                payload = json.loads(error.read(65536))
                if error.code == 422 and payload.get("error") == "invalid_document":
                    detail = "; ".join(
                        ".".join(map(str, item.get("loc", []))) + ": " + item.get("msg", "")
                        for item in payload.get("details", [])[:8]
                    )[:1600]
                elif payload.get("error") in {
                    "invalid_operation",
                    "file_error",
                    "disk_conflict",
                    "unsaved_changes",
                }:
                    detail = str(payload.get("message", ""))[:1600]
            except (ValueError, AttributeError, TypeError):
                pass
            # Never echo input values, request headers, credentials or raw payloads.
            raise BridgeError(
                f"Local API returned HTTP {error.code}; no automatic retry. "
                "For 409, re-read the project and compare the proposal. " + detail
            ) from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise BridgeError(
                "Local service unavailable or request outcome uncertain. "
                "Inspect the project before repeating a write."
            ) from error

    def project(self, project_id):
        return self.request("/api/v2/projects/" + urllib.parse.quote(project_id, safe=""))

    def validate(self, project):
        return self.request("/api/v2/projects/validate", {"document": project})


def compile_story(story):
    if (
        story.get("format") != "ludo-storyboard"
        or type(story.get("version")) is not int
        or story["version"] != 1
    ):
        raise BridgeError("Expected ludo-storyboard version 1.")
    allowed = {"format", "version", "name", "content", "notes", "character_notes"}
    if set(story) - allowed or set(story.get("content", {})) - CONTENT_KEYS:
        raise BridgeError("Unsupported storyboard field; use the documented format.")
    if not isinstance(story.get("name"), str) or not story["name"].strip():
        raise BridgeError("Storyboard needs a name.")
    content = copy.deepcopy(story.get("content", {}))
    for key in CONTENT_KEYS - {"world", "initial_state"}:
        content.setdefault(key, [])
        if not isinstance(content[key], list):
            raise BridgeError(f"{key} must be a list.")
    project = {
        "format": "ludo-npc-project",
        "schema_version": 2,
        "project_id": "project-" + uuid.uuid4().hex,
        "name": story["name"],
        "revision": 1,
        "content_revision": 1,
        "layout_revision": 1,
        "content": content,
        "editor": {
            "canvases": [],
            "dialogue_layouts": {},
            "character_notes": story.get("character_notes", {}),
        },
    }
    nodes = [
        {
            "entity": {"kind": kind, "id": row["id"]},
            "position": {"x": 80 + (i % 3) * 330, "y": 80 + (i // 3) * 250},
        }
        for i, (kind, row) in enumerate(
            (kind, row)
            for kind, collection in COLLECTIONS.items()
            for row in content[collection]
            if kind in {"character", "location", "faction", "event", "dialogue"}
        )
    ]
    project["editor"]["canvases"].append(
        {
            "id": "canvas-" + uuid.uuid4().hex,
            "name": story["name"],
            "nodes": nodes,
            "edges": [{"relation_id": row["id"]} for row in content["relations"]],
        }
    )
    # Presentation positions are separate from story logic. Entry/end are UI-only.
    for graph in content["dialogues"]:
        project["editor"]["dialogue_layouts"][graph["id"]] = {
            node["id"]: {"x": 340 + (i % 3) * 360, "y": 40 + (i // 3) * 340}
            for i, node in enumerate(graph["nodes"])
        }
    return project


def draft_commands(project, proposal):
    if (
        proposal.get("format") != "ludo-draft-proposal"
        or type(proposal.get("version")) is not int
        or proposal["version"] != 1
    ):
        raise BridgeError("Expected ludo-draft-proposal version 1.")
    if set(proposal) - {
        "format",
        "version",
        "project_id",
        "expected_revision",
        "expected_author_hash",
        "changes",
    }:
        raise BridgeError("Unsupported proposal field.")
    if (
        proposal.get("project_id") != project["project_id"]
        or type(proposal.get("expected_revision")) is not int
        or proposal["expected_revision"] != project["revision"]
    ):
        raise BridgeError(
            "Proposal snapshot is stale or belongs to another project; compare again."
        )
    changes = proposal.get("changes")
    if not isinstance(changes, list) or not 1 <= len(changes) <= 10:
        raise BridgeError("Submit 1–10 draft changes per proposal.")
    candidate = copy.deepcopy(project)
    commands = []
    targets = set()
    for change in changes:
        if set(change) - {
            "target",
            "operation",
            "patch",
            "name",
            "source_refs",
            "scene_context",
        }:
            raise BridgeError("Unsupported draft change field.")
        target = change["target"]
        kind, identity = target["kind"], target["id"]
        if kind not in COLLECTIONS or (kind, identity) in targets:
            raise BridgeError("Unsupported or duplicate draft target.")
        targets.add((kind, identity))
        operation = change.get("operation", "update")
        rows = candidate["content"][COLLECTIONS[kind]]
        current = next((row for row in rows if row["id"] == identity), None)
        patch = change["patch"]
        if (
            not isinstance(patch, dict)
            or not patch
            or set(patch) & {"id", "kind", "confirmed_fields"}
        ):
            raise BridgeError(
                "Patch must contain author fields, without ID/kind/protection changes."
            )
        if operation == "update" and current is not None:
            if any(
                key in current.get("confirmed_fields", []) and value != current.get(key)
                for key, value in patch.items()
            ):
                raise BridgeError("Confirmed fields are protected. Use manual author editing.")
            base = {key: copy.deepcopy(current.get(key)) for key in patch}
            current.update(copy.deepcopy(patch))
        elif operation == "create" and current is None:
            base = {}
            rows.append({"kind": kind, "id": identity, **copy.deepcopy(patch)})
        else:
            raise BridgeError("Create/update target does not match the current project.")
        draft = {
            "id": "draft-" + uuid.uuid4().hex,
            "name": change.get("name", "External AI proposal"),
            "target": target,
            "operation": operation,
            "base_content_revision": project["content_revision"],
            "basis_hash": proposal["expected_author_hash"],
            "base_values": base,
            "status": "pending",
            "patch": patch,
            "model": "external-ai / user-assisted",
            "source_refs": change.get("source_refs", []),
        }
        if change.get("scene_context") is not None:
            draft["scene_context"] = change["scene_context"]
        commands.append({"type": "put_draft", "draft": draft})
    # Also validate pending records, not merely the hypothetical accepted content.
    pending = copy.deepcopy(project)
    pending["content"]["drafts"].extend(command["draft"] for command in commands)
    return candidate, pending, commands


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", help="Actual URL shown by the local NPCs AI Studio service")
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("list", help="List open projects; no file writes")
    for name in ("inspect", "draft", "simulate"):
        command = commands.add_parser(name)
        command.add_argument("--project-id", required=True)
        if name != "inspect":
            command.add_argument("--input", required=True)
        if name == "draft":
            command.add_argument(
                "--apply", action="store_true", help="Submit pending drafts and save"
            )
        else:
            command.add_argument("--output", required=True)
    for name in ("compile", "validate", "import"):
        command = commands.add_parser(name)
        command.add_argument("--input", required=True)
        if name == "compile":
            command.add_argument("--output", required=True)
        if name == "import":
            command.add_argument("--destination", required=True)
            command.add_argument(
                "--apply", action="store_true", help="Import as a new saved project"
            )
    args = parser.parse_args(argv)
    if args.action != "compile" and not args.base_url:
        raise BridgeError("--base-url is required. Do not guess a fixed port.")
    api = LocalAPI(args.base_url) if args.base_url else None
    if args.action == "list":
        return api.request("/api/v2/projects")
    if args.action == "inspect":
        context = api.request(
            "/api/v2/projects/" + urllib.parse.quote(args.project_id, safe="") + "/author-context"
        )
        project = context["project"]
        write_json(args.output, context)
        return {
            "project_id": project["project_id"],
            "revision": project["revision"],
            "output": str(Path(args.output).resolve()),
        }
    if args.action == "compile":
        project = compile_story(read_json(args.input))
        if api:
            api.validate(project)
        write_json(args.output, project)
        return {
            "project_id": project["project_id"],
            "output": str(Path(args.output).resolve()),
            "validated_by_ludo": bool(api),
            "notes": read_json(args.input).get("notes", []),
        }
    if args.action == "validate":
        return api.validate(read_json(args.input))
    if args.action == "import":
        project = read_json(args.input)
        api.validate(project)
        destination = Path(args.destination)
        if not destination.is_absolute() or destination.exists() or not destination.parent.is_dir():
            raise BridgeError("Destination must be a new absolute filename in an existing folder.")
        if project["project_id"] in {row["project_id"] for row in api.request("/api/v2/projects")}:
            raise BridgeError("Project ID already open. Import a newly compiled project instead.")
        if not args.apply:
            return {
                "validated": True,
                "applied": False,
                "destination": str(destination),
            }
        imported = api.request("/api/v2/projects/import", {"document": project})
        pid = urllib.parse.quote(imported["project_id"], safe="")
        print(json.dumps({"imported_project_id": imported["project_id"], "saved": False}))
        api.request(
            f"/api/v2/projects/{pid}/save",
            {"expected_revision": imported["revision"], "path": str(destination)},
        )
        return {
            "project_id": imported["project_id"],
            "saved": True,
            "path": str(destination),
        }
    context = api.request(
        "/api/v2/projects/" + urllib.parse.quote(args.project_id, safe="") + "/author-context"
    )
    project = context["project"]
    pid = urllib.parse.quote(args.project_id, safe="")
    if args.action == "simulate":
        body = read_json(args.input)
        body.setdefault("expected_content_revision", project["content_revision"])
        result = api.request(f"/api/v2/projects/{pid}/simulate", body)
        write_json(args.output, result)
        return {
            "output": str(Path(args.output).resolve()),
            "complete": result.get("complete"),
        }
    proposal = read_json(args.input)
    if proposal.get("expected_author_hash") != context["author_hash"]:
        raise BridgeError("Author context changed; inspect and compare again.")
    candidate, pending, batch = draft_commands(project, proposal)
    api.validate(candidate)
    api.validate(pending)
    if not args.apply:
        return {
            "validated": True,
            "applied": False,
            "drafts": len(batch),
            "revision": project["revision"],
        }
    file_status = api.request(f"/api/v2/projects/{pid}/file")
    if not file_status.get("path") or file_status.get("dirty"):
        raise BridgeError("Save current work in NPCs AI Studio before submitting external drafts.")
    updated = api.request(
        f"/api/v2/projects/{pid}/commands",
        {"expected_revision": project["revision"], "commands": batch},
    )
    print(json.dumps({"draft_ids": [c["draft"]["id"] for c in batch], "saved": False}))
    api.request(f"/api/v2/projects/{pid}/save", {"expected_revision": updated["revision"]})
    return {
        "submitted": len(batch),
        "saved": True,
        "review_in": "NPCs AI Studio draft review",
        "draft_ids": [c["draft"]["id"] for c in batch],
    }


def cli_main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    try:
        print(json.dumps(main(argv), ensure_ascii=False, indent=2))
    except (BridgeError, OSError, ValueError, KeyError, TypeError) as failure:
        print(f"Bridge error: {failure}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    cli_main()
