# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Ludo product decisions

- User selected `docs/design-reference.png`: warm charcoal, copper highlights, dense professional narrative workstation. Preserve left library, central draggable text cards, right inspector, and bottom multi-track timeline.
- This tool plans NPC text, character knowledge, stories and dialogue branches. It does not create in-game character models or run a game engine.
- World facts precede generation. Drafts require review before entering the project. Keep confirmed character facts during simulated story updates.
- Current frontend uses the batch-four Python v2 API, generic deterministic rehearsal, local JSON files, configurable chat/completions generation, and per-field draft review. Python contracts/API are in `backend/`. Distinguish actual provider requests from protocol fixtures; no external model was called in batch-four verification. Publishing is separate from local implementation.
- API keys stay in page-session memory and must not enter project persistence or exports.
- 灯港 and independent 荒原驿站 use the same Python rehearsal engine. Events/rules fire once per replay. Keep initial author definitions separate from derived runtime state; preserve future action inputs on rewind, filter them by target time, and fork before adding new past actions. Explain bounds and diagnostics; do not claim daily schedules, automatic prose reasoning, or full ecology.

## Product planning constraints

- User requested a Python architecture and local storage with no external persistence services. Follow `docs/product-and-development-plan.md` for the proposed modules and development stages.
- User confirmed that all persisted application data belongs in local folders: project content and history in the selected project location, app settings/cache/logs in the local app configuration location. No cloud persistence is required.
- The Python v2 contracts, typed references, atomic commands and explicit v1 migration are implemented. Batch two implements local JSON persistence, backups/recovery, revision/fingerprint conflicts, OS file locks, React integration, and an early Windows package. Batch three implements generic authoring and execution, scene/action ordering, saved branches, rewind, and condition/change explanations. Project data belongs in user-selected folders; repo `.local-data/` and `.local-projects/` are development overrides, not user defaults. A clean Windows machine and full native-picker selection still need verification. Use `docs/batch-3-delivery.md` for current execution semantics and limits.
- Regenerate `schemas/` and v2 sample projects with `python -m ludo_npc.tools generate --root .` after contract changes; run `--check` and backend tests. Preserve v1 fixtures. Use the independent outpost example to prevent built-in story IDs entering generic domain logic.
- Remote model calls are separate from storage: local editing and simulation should work offline; generating with a remote provider uses the user's chosen connection.
- Batch four implements 1–10 generation items, 2 concurrent provider calls, SSE progress/cancel, partial failures, explicit retry of failed items, interrupted records, field review, author-hash staleness and confirmed-field protection. Keys remain transient. Read `docs/batch-4-delivery.md` for exact limits. Real vendor compatibility and output quality require an effective user-configured connection; local fixtures prove only protocol and workflow. Keep candidate edits separate from accepted history.

- User approved multi-model configuration management: enable several independent profiles, one general default and purpose defaults for character/story/dialogue/text, plus an explicit per-generation override. Preserve the warm dense workstation style. Profile removal is recoverable archive, not destructive deletion. Per-profile API keys stay in page memory; copying/restoring does not copy/recover keys. Submitted jobs snapshot profile name/model/endpoint/purpose and keep that provenance after configuration edits/removal. Multiple enabled models do not imply automatic model collaboration.
