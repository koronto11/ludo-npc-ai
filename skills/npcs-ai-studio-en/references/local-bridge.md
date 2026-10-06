# Local collaboration bridge

The collaboration Windows build can replace `python scripts/npc_studio_bridge.py` with `NPCsAIStudio.exe --skill-bridge`; remaining arguments are identical. Resolve the user's actual executable path. It connects to the existing service without starting another workbench. Earlier Windows builds lack this entrypoint.

Run commands from the Skill folder. Replace `LOCAL_URL` with the actual local NPCs AI Studio URL and choose `PROJECT_ID` from `list`. Do not assume a fixed port. The helper requires Python 3.10+ and no third-party packages.

## Compile and create a new project

```text
python scripts/npc_studio_bridge.py --base-url LOCAL_URL compile --input storyboard.json --output candidate.ludo.json
python scripts/npc_studio_bridge.py --base-url LOCAL_URL validate --input candidate.ludo.json
python scripts/npc_studio_bridge.py --base-url LOCAL_URL import --input candidate.ludo.json --destination ABSOLUTE_NEW_PROJECT_PATH
python scripts/npc_studio_bridge.py --base-url LOCAL_URL import --input candidate.ludo.json --destination ABSOLUTE_NEW_PROJECT_PATH --apply
```

`compile` generates a fresh project ID, a relationship canvas and dialogue card positions. With a local URL, NPCs AI Studio validates the candidate before the file is created. Compilation without a URL is possible but has not passed complete validation; do not report it as verified. Existing output files are never overwritten.

`import` defaults to a check; only `--apply` imports and saves. The destination must be a new absolute filename in an existing folder. Existing files and already-open project IDs are refused. Import and save are separate calls. If saving fails, the project may remain in service memory: inspect its printed ID and use Save As in NPCs AI Studio instead of importing again. After success, use Project → Open to select the file. The helper does not force the user's page to switch projects.

## Read an existing project

```text
python scripts/npc_studio_bridge.py --base-url LOCAL_URL list
python scripts/npc_studio_bridge.py --base-url LOCAL_URL inspect --project-id PROJECT_ID --output snapshot.json
```

`list` lists already-open projects; it does not scan the computer. Ask the author to open an unopened project in NPCs AI Studio. The output is `ludo-author-context`: `project` contains the project snapshot and `author_hash` is the server hash for that same snapshot. Copy `project_id/expected_revision` from `project` and `expected_author_hash` from the hash. Snapshots contain author secrets and narrative text; keep them in the chosen local location. Model connection settings are not read. Unsubmitted browser forms are absent from service snapshots, so the author should save current work first.

## Submit entity candidates

Example proposal:

```json
{
  "format": "ludo-draft-proposal",
  "version": 1,
  "project_id": "project-EXACT-ID-FROM-SNAPSHOT",
  "expected_revision": 1,
  "expected_author_hash": "EXACT-AUTHOR-HASH-FROM-SNAPSHOT",
  "changes": [{
    "target": {"kind": "character", "id": "EXISTING-CHARACTER-ID"},
    "operation": "update",
    "name": "Healer backstory addition",
    "patch": {"story": "A story candidate based on the author's existing context."},
    "source_refs": []
  }]
}
```

```text
python scripts/npc_studio_bridge.py --base-url LOCAL_URL draft --project-id PROJECT_ID --input proposal.json
python scripts/npc_studio_bridge.py --base-url LOCAL_URL draft --project-id PROJECT_ID --input proposal.json --apply
```

Submit 1–10 targets per proposal, one candidate per target. `expected_revision` must match the exact snapshot used to write the proposal; do not change it merely to bypass a conflict. By default the bridge validates both the hypothetical accepted project and pending records. `--apply` creates and saves pending drafts while leaving formal entity fields unchanged. The author opens cards in Draft Review and decides whether to accept or reject.

Supported kinds: `character/location/faction/fact/variable/event/rule/dialogue/text`. Use the corresponding entity Schema. `update` requires an existing target. `create` requires a fresh stable ID and all required fields in `patch`. Do not change `id/kind/confirmed_fields`; protected changes are refused. New candidates cannot reference other unaccepted candidates. Adopt dependencies first and submit another round, or compile the connected story as a separate new project.

`source_refs` identifies real existing source objects, not invented providers or generation jobs. Provenance is marked external AI collaboration. Candidates use the server author hash as their review basis; do not recreate the hash in the client. Changes to an external proposal's content basis require re-comparison in NPCs AI Studio.

For dialogue on an existing NPC appearance, optionally provide `scene_context`. See `SceneGenerationContext` in the project Schema: `level_id/track_id/location_id/appearance_id/group_name/mode/start_tick/end_tick`. Use `mode: people`; dialogue ownership must match the appearance, and its interval must lie within that appearance. NPCs AI Studio links the dialogue on adoption. Do not use `pool` to represent an NPC group.

## Sequential review and conflicts

Independent NPC scene dialogue registered in the same platform generation task can be reviewed and accepted one at a time. When content changes come only from accepting other independent NPCs in that batch and linking their appearances, the server verifies the original basis without requiring re-comparison solely for those changes. It neither auto-accepts other candidates nor rewrites historical bases. Manual changes to world rules, profiles, scene arrangements or accepted prose, multiple candidates for one NPC, and records whose independence cannot be proved still require explicit re-comparison. Save candidate edits before accepting so the server can verify the actual accepted values.

External AI proposals submitted by the bridge have no platform generation-task registration and do not qualify for this same-batch check. Submitting several characters together does not bypass the basis check. Preserve exact `expected_revision/expected_author_hash`; on 409, read and compare again. Do not fabricate `task_id`, generation records or revision values to suppress a warning. This review improvement does not give the bridge model-calling or automatic-acceptance capabilities.

## Rehearse

```text
python scripts/npc_studio_bridge.py --base-url LOCAL_URL simulate --project-id PROJECT_ID --input trial.json --output trial-result.json
```

Example inputs are in `assets/trial-injured.json` and `assets/trial-healthy.json`. This computes a result without saving a play record and refuses an existing output file. If `expected_content_revision` is omitted, the bridge uses the freshly read project's content revision. The author must adopt dialogue drafts first; otherwise the engine executes the old formal content.

## Errors and boundaries

- 409: the snapshot is stale. Read again, compare the original proposal and produce a new proposal rather than retrying blindly.
- 422: a field, type, reference or condition is invalid. Consult the running service's `/api/v2/schema` and `/openapi.json`.
- Timeout/disconnection: the write may have succeeded. Inspect receipt IDs and project contents before repeating.
- Save failed after submission: drafts may remain in memory. Save through NPCs AI Studio; do not restart as a recovery tactic.
- Credentials, cloud services and model testing are outside this helper. The user's own AI creates the content; it need not call NPCs AI Studio's model endpoint.
