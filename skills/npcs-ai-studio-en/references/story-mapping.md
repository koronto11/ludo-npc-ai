# Map a story to the workbench

Storyboard fields: `format: ludo-storyboard`, integer `version: 1`, `name`, `content`, optional `notes` and `character_notes`. `notes` lists inferences for author review; it is not imported as narrative content. Deliver it with the storyboard. `character_notes` maps character IDs to short reminders. A storyboard is not a v2 NPCs AI Studio project and cannot be opened directly from the Project menu.

`content` supports `world/characters/locations/factions/facts/variables/events/rules/dialogues/texts/relations/levels/initial_state`. Collections are arrays with fields matching the project Schema; empty collections may be omitted. Exclude model settings, drafts and generated/play histories. Do not add arbitrary fields. The bridge adds a basic visual layout.

| Story concept | NPCs AI Studio mapping | Detail |
| --- | --- | --- |
| Premise and writing rules | `world.premise/rules/tone` | Distinguish established rules from suggestions |
| Chapter or level | `levels[]` | May contain several scenes and repeat appearances |
| Camp, infirmary, other places | `locations[]` + `level.tracks[]` | Track references a location; it is separate from a profile |
| Arrival, dusk, alarm phases | `level.anchors[]` | Integer ticks; axis mode `phase` or `time` |
| Character | `characters[]` | Stable ID, role for identity, note for quick recall |
| A character at a time/place | `level.appearances[]` | Character, track, interval and explicit dialogue IDs |
| Three villagers by a fire | `level.npc_groups[]` + three profiles/appearances | Separate lines per member, not one multi-speaker text blob |
| Relationship | `relations[]` | Typed `{kind,id}` endpoints; acquaintance is not shared knowledge |
| Injury, trust, alert status | `variables[]` | Correct boolean/number/text defaults |
| Trigger and consequences | `events[]/rules[]` | Scope references a level/track; currently once per replay |
| Player conversation | `dialogues[]` | Default entry, cards, choices, conditions, effects and targets |
| Letter, rumor, diary | `texts[]` | Body and availability condition, not a character |
| Who knows a secret | `facts[]` + initial knowledge / grant effects | Private is an author marker, not a prose filter |

Time: use established author units. For phases only, chapter/phase ticks can express order; explicitly label them ordinal rather than real minutes. Levels do not provide separate time domains: the engine uses a shared story tick. Appearance endpoints may both be active. Define boundaries for consecutive scenes to avoid accidental simultaneous appearances.

Dialogue: `entry_node_id` usually identifies the opening. Put an injured-player requirement on the relevant `options[]` item. Put healing effects on either that option or the treatment card according to the intended execution time; do not apply them twice. `target_node_id: null` ends the conversation. Use `entry_routes[]` only when the author wants the opening itself to depend on state.

Appearance-following dialogue: the entry card can use `{op: appearance, level_id: ..., appearance_id: ...}`; put the graph ID in that appearance's `dialogue_ids`. Python enforces the appearance's scene, interval and extra conditions. An empty dialogue list has legacy actor/common-dialogue semantics; do not use it to mean “no dialogue.”

Give a key conversation at least two tests: the ordinary state and the condition satisfied. Prefer a simple default entry when the player should make the choice. Human authors must review prose quality, contradictions and secrets; Schema validation cannot do that.

For a novel, extract meaningful levels rather than copying every sentence. Preserve motives and relationships that affect behavior; place other details in character stories. Retain unsupported mechanics as author notes rather than inventing engine operation names.

Project hierarchy: keep global background, rules and style in the world brief. Each level uses `region` for its region and `description` for local setting, story phase and conflict. Character profiles are shared across the project; scenes reference them through appearances. Do not put level regions in legacy `world.district`.

## Dialogue quantity and length

Cards per NPC means the total `nodes` in that NPC's dialogue graph, including the opening and every branch card. It does not mean sentences, player choices or character count. One card can contain several sentences. Each scene group member has a separate dialogue graph; do not mix several NPC speakers into one candidate.

For example, 4 NPCs with 2 cards each produce 4 individual dialogue candidates containing 8 cards in total. An opening and a treatment branch already use one NPC's 2 cards. A choice with `target_node_id: null` can end the conversation without an extra farewell card. Quantity checks do not replace target and effect validation.

Console scene generation supports 1–6 cards per NPC (default 2). Each card's text can be short (120), medium (240) or long (480 Unicode characters), including punctuation and spaces but excluding player-choice text. Anonymous environment text uses a length per body, has no card count and creates no characters. If scale is unspecified, suggest 2 short cards for ordinary background NPCs; agree on the scope of key plot conversations rather than treating scene generation ranges as project-wide limits. Preserve untouched cards when updating existing dialogue; do not delete branches to fit a default count.

State the NPC count, cards per NPC, total cards and text length before writing, then verify each NPC's actual `nodes` count and `text` length. Do not truncate prose, leave broken targets or remove required effects to meet a count; revise the structure or explain that the scope needs adjustment. English length counts characters, not words.

`GenerationItem.output_limits` with `card_count/text_length` belongs only to platform model generation requests; consult the running service's `/openapi.json` for exact fields. Do not add it to storyboards, entity patches or bridge proposals. The platform checks constrained model output and tightens the per-item output token cap. Quantity/length failures do not trigger another model call for automatic repair, and failed output may already consume usage. A cap is neither actual usage nor a price estimate. An external AI using this Skill checks the scale itself; bridge structural validation does not replace this check or call the platform model again. Retry only failed platform items with their original limits while retaining successful candidates.
