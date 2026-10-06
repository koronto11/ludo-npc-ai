# Data and rehearsal details

Use `assets/project-v2.schema.json` and search `$defs.Character/Level/Dialogue/Event/Rule/Condition/Effect` for exact required fields. If the service has upgraded, its `/api/v2/schema` and `/openapi.json` take precedence. Use stable IDs for entities, levels, tracks, anchors, appearances, dialogue nodes and options. Pattern: `^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$`. Avoid cross-entity collisions. Names may use any language; IDs should not depend on names.

Conditions: `always`; `all/any` with `conditions`; `not` with `condition`; `variable` with `variable_id/comparison/value`; `time` with `comparison/value`; `scene` with `location_id`; `appearance` with `level_id/appearance_id`; `knows` with `character_id/fact_id`; `at_location`; `event_occurred`. Comparisons: `eq/ne/gt/gte/lt/lte`.

Effects: `set_variable`, `increment_variable`, `grant_knowledge`, `move_character`, `set_behavior`, `unlock_text`. Consult the Schema for fields. They modify runtime state, not formal character definitions. Events/rules do not implement recurring schedules, ecology or natural-language condition evaluation.

Tests use `/simulate`. Key fields: `at_tick/location_id/level_id/variable_overrides/card_trial`. `card_trial` contains `dialogue_id/started/use_entry_routes/start_node_id/actions`; actions are `{type: variable, variable_id, value}` or `{type: choice, option_id}`.

- Default card play: `started: true`, `use_entry_routes: false`. Start from the default/specified card while still enforcing presence and option conditions.
- Actual entry verification: `use_entry_routes: true`. Conditional openings match in order; these are separate from player-option conditions.
- Set starting injury through `variable_overrides`. For mid-play state changes, use a variable action rather than replaying the card's entry effects.
- Check `complete/diagnostics/dialogues/log/card_trial` as available in the actual response. Diagnostics or unavailable dialogue must not be reported as success.
- This helper neither saves play records nor accepts candidates. Tests execute the formal project only.

Knowledge: a fact's `available_at` cannot be later than the initial knowledge tick. Use explicit facts and knowledge conditions/grants for secrets. `visibility: private` alone does not establish that prose is free of spoilers.

For large projects, work in slices and focus AI context on the relevant level/characters rather than repeating all histories. Use conservative revision checks after inspecting a snapshot; never silently “fix” expected_revision. Passing structure checks does not cover every branch. Report the specific time, scene, initial state and option sequence tested.

The library ellipsis offers type-specific editing and usage navigation. Deletion shows its scope and references before confirmation; hiding historical records does not resolve references. Character deletion explicitly clears its own initial state; level deletion keeps shared characters and dialogue. Use session undo or saved-project backups for recovery.

The console world brief uses four editor sections with one retained draft and fixed save status. Confirmed rules are individually editable text constraints; bulk paste creates one per line while line breaks inside a rule are retained. Premise, writing style and each rule support up to 30000 characters, with up to 500 rules; expanding the editor changes no project data.

## Canvas order and story time

NPC groups, character appearances and plot events can share a mixed order on the level canvas. Drag a title vertically to reorder; an insertion line shows the destination. Moving to another scene changes scene membership while retaining time; an NPC group retains each member's duration and relative offset. Horizontal dragging within the same ordering row adjusts time. With the time axis hidden, horizontal dragging does not become a time change. The right-edge handle adjusts display width separately from title dragging. The canvas scrolls near its edges, Esc cancels the current drag, and completed changes support author undo/redo.

Order is stored in `editor.level_control_orders[level_id]` using keys `appearance:ID/group:ID/event:ID`; widths are in `editor.level_control_widths`. These are presentation metadata and do not change story time, dialogue content or the generation author fingerprint. Express narrative order through actual anchors, appearance times, events and dialogue targets rather than vertical card positions. Scene membership or time changes are narrative edits; check appearances, event scopes and dialogue conditions accordingly.

Preserve existing presentation metadata during collaboration. Current `ludo-storyboard` compilation provides a basic layout and accepts no custom `editor` input. The draft bridge does not expose order/width writes either. Direct the author to adjust these on the level canvas instead of inventing entity fields.
