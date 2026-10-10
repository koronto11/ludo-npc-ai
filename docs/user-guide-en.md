# NPCs AI Studio · User guide

## 1. Start a project from scratch

NPCs AI Studio plans text-based NPCs, character stories, appearances, relationships and dialogue branches. It does not create in-game models or run a game engine. Manual editing and play work offline; remote-model generation needs an internet connection.

1. Save your current work, then choose Project → New local project in the top-left menu.
2. Enter a project name, such as “Wasteland camp”, and choose a parent location such as D:/My projects. The dialog previews the same-name folder it will create.
3. The filename initially follows the project name and can be adjusted. Choose Blank world for your own work, or a sample such as Camp level example to learn the workflow.
4. Click Create project folder. If that folder already exists, change the name or location; it will not be overwritten. Previously saved projects remain.
5. Write the shared world brief, then create levels. Set each level’s region and description before building scenes, adding characters and arranging appearances. Old region data can be moved into a chosen level in its settings; saving clears the old field. Then edit dialogue and story rules. This manual workflow needs no model.
6. For generation, choose a model and describe your requirements. Results become drafts first and enter official content only after review.

- If you see an unsaved warning, save or explicitly discard pending edits. Switching projects does not delete saved files.
- After submitting an edit, wait for Saved to file or press Ctrl + S. Form fields are not submitted until their own Save action succeeds.

## 2. Workspaces and everyday controls

Work around “who appears where and when, and what they say”. A shared character profile defines a person. An appearance places that person in a particular level and scene. Dialogue is a reusable or appearance-linked text flow.

1. View uses checkmarks for the library, inspector and timeline. Focus workspace temporarily hides these panels; click it again to restore them. Restore default layout uses the current screen size. Pages with their own card details explain and disable the separate inspector option.
2. The left library finds levels, characters, world rules and text. Generation and review below shows active, pending and failed counts.
3. The level canvas arranges scenes, time, appearances, NPC groups and story events. Characters provides central search and grouping; the relationship canvas plans connections.
4. The character workbench organizes dialogue by specific appearance. Edit cards centrally and play on the right. Draft review collects candidates and failure records.
5. Canvas toolbars offer selection, panning, connections, highlighting or Fit canvas as appropriate. Hold Space to pan; use Fit canvas to find content after zooming.
6. Leaving unsaved dialogue opens a top panel: Discard and leave, Save and leave, or Cancel. Cancel keeps edits; failed saving prevents navigation.

- Interface language changes controls only. Character names, stories, dialogue, groups and scenes remain verbatim, as do pending edits.
- Global and level undo share one edit journal. Ctrl + Z undoes; Ctrl + Shift + Z or Ctrl + Y redoes. Inputs and dialogs retain their own editing behavior.

## 3. World brief, facts and variables

The world brief supplies shared writing constraints. Facts and variables supply explicit condition data. Natural-language world rules do not automatically become executable story rules.

1. Open World settings → World brief, or World rules in the library, and enter the project-wide world name, premise, writing style and confirmed rules. The editor has Basic information, Premise, Confirmed rules and Writing style sections; switching retains input and the window can expand. Edit rules individually or paste one rule per line. Save status and Save and close remain fixed at the bottom. Premise, style and each rule support up to 30000 characters, with up to 500 rules. Put regions and local story context in level settings. The breadcrumb shows World / Current level; click either name to open its settings.
2. World settings → Locations and regions / Factions lists, creates and edits shared assets, even before a level exists. Click a location or faction in the library to open its full data: name, role, description, tags, and parent location or faction policies. Characters open their profile and dialogue or text opens its authoring entry.
3. Closing the world editor, pressing Escape or clicking outside checks unsaved changes. Choose Save and close, Close without saving or Continue editing. Failed saves retain your input; concurrent changes to the same field are not overwritten.
4. World settings opens facts, variables and global story rules directly. Global rules and data on the level canvas or Story and text data in the library also provides these resources and initial state.
5. Facts include content, truth status, visibility and availability time. Public does not mean every character knows it; set initial knowledge or grant it through an effect.
6. Variables support Boolean, Number and String. For example, Player injured can be Boolean with a false default; Trust can be Number with a zero default.
7. Reference variables or facts in conditions. Effects set values, increment numbers or grant knowledge. Keep unknown secrets separate from known information.

- Models can use world context, but structural checks do not prove prose is free of leaks or contradictions. Author review remains necessary.
- Initial state defines the story starting point. Changing player variables during play changes the test, not character profiles or world initial definitions.

## 4. Levels, time axes and appearances

The horizontal axis represents time or plot phases; the vertical axis contains ordered scenes. This plans when and where characters appear, rather than game-map coordinates.

1. Click New level, set its name and first scene, then use Scenes and anchors to add tracks, world-location links and time anchors.
2. Time and scene axes can be toggled independently. Plot phases currently map to integer world-clock positions; equal values mean simultaneous actions.
3. Double-click or press F2 to rename axis labels. Enter saves, Esc cancels. Right-click to edit, remove or assign marker colors/icons. Append nodes at either axis end.
4. Drag time anchors horizontally and reorder scenes vertically. Colors and icons are author markers, not story effects.
5. Drag in a character or click Arrange characters, then choose a scene and interval. Drag the control to move an appearance, adjust its endpoints or open Configure appearance.
6. For crowded scenes, choose Group appearances, select cards from the same scene, then name and save the group. The scene sidebar also offers a member picker. Groups start collapsed; expand for individual appearance settings, dialogue editing and play. Show dialogue summaries restores detailed previews. Manage members on the group header supports search, addition, removal and confirmed dissolution with undo. Grouping retains profiles, individual times and dialogue; different times are marked as a coverage range. Whole-group movement keeps offsets. Batch generation remains explicit.
7. Drag appearances, NPC groups and events vertically into a mixed order; release at the insertion line. Reordering or switching scenes preserves times. Horizontal movement within the same row adjusts time. Canvas edges auto-scroll and Esc cancels. Vertical arrangement works with the time axis hidden, supports undo, and does not invalidate draft review.
8. Characters can appear repeatedly. Appearances share the profile but have separate conditions, behavior notes and dialogue. Removing an appearance keeps the character.
9. Dialogue linkage check inspects explicit scene/time conditions. Follow this appearance lets moves change dialogue availability; shared dialogue is copied before becoming appearance-specific.

- Removing an anchor detaches bindings while retaining times. Removing a scene keeps unassigned appearances; linked story scopes must be resolved first.
- Planned behavior is a note. Runtime changes require explicit dialogue effects or story rules.

## 5. Profiles, groups and quick notes

Characters shows profiles across the project. A profile defines identity, story and knowledge; groups organize the library, while quick notes remind the author of concepts. These differ from scene NPC groups.

1. Create character in Characters opens a character-only form for name, identity, narrative role and summary, and keeps you in Characters after creation. Use the respective entries for locations and factions. You may also review a generated character draft. Select Edit character profile to continue with story, personality, voice, goals, boundaries and uncertainties.
2. Protect individual fields to stop model candidates overwriting confirmed details. Protection does not prevent manual author edits.
3. Quick notes are shared by Characters and the relationship canvas and saved in the project. They do not enter generation context or rehearsal. Long stories in the inspector can be expanded or collapsed.
4. Click a group tag or Manage groups in the card menu. A character may belong to several groups. Select multiple characters to add, remove or move one membership in bulk.
5. A dash means mixed membership: leave unchanged to preserve it, check to add all, uncheck to remove all. Renaming to an existing group merges members. Dissolving keeps characters, other groups and appearances.
6. Use appearance counts to locate a level appearance or open its dialogue. Search and bulk selection cover all results; pages contain 60 cards.

- Profile groups are tags; scene NPC groups collect appearances. Changing one does not automatically change the other.

## 6. Relationships and highlighting

The relationship canvas shows characters and related objects to review factions, locations, story connections and personal ties. A relationship description does not automatically create runtime effects.

1. Drag objects from the library or reference them through Add node. Referencing a character does not duplicate its profile.
2. Move cards and connect their ports or use Connect. Set the relationship name, direction, category and description. Double-click a link to edit.
3. Filter by name, identity, group, level, scene or relationship category. The relationship list also finds links outside the current canvas view.
4. Select a character and click Highlight connections to emphasize it, direct associates and incident links. Click again to show all. Selection alone does not activate highlighting.
5. Card actions open profiles, manage groups, show appearances or open the character workbench. Quick notes synchronize with Characters.

- If a story should change behavior or state, author executable conditions and effects; natural-language link descriptions are not sufficient.

## 7. Dialogue cards, choices and links

The character workbench combines editing and play. Select a specific appearance, then organize its scene dialogue. Common and unlinked dialogues remain in separate collapsible sections.

1. Open Edit / Play from a character, appearance or NPC member. Select dialogue under the appearance. Create scene dialogue or link existing dialogue if needed.
2. Edit the card title, speaker and text. Add a player choice, then click its text or Edit button to enter the response and save.
3. Switch to Quick text to edit titles, speakers, speech, choices and destinations continuously. Click an overview node to locate its text, or Locate on canvas to return to that card. Configure complex conditions and effects through the settings buttons. Both modes share the same draft.
4. In a quick-text input, Ctrl / Cmd Enter adds a dialogue card; Ctrl / Cmd Shift Enter adds a choice to the current card. New cards are not linked automatically: set their destinations explicitly. Save before playing from a card. On narrow screens, expand the branch overview when needed.
5. Drag a choice output to its destination card or set the destination in its editor. No target ends dialogue. Paths may merge or intentionally loop.
6. Conditions govern card or choice availability. Effects run on card entry or choice selection. Long text has a full editor rather than being confined to a small card.
7. Default and conditional openings select the start card. Conditional routes are checked in order. Put a condition on the player choice when the player should choose actively.
8. Click links to color them or add draggable routing points. Double-click a point to remove it; reset automatic routing or default color. Markers do not change dialogue execution.
9. Beautify canvas re-layouts cards by branch structure and measured height, routing automatic links around cards with separate branch channels and fan-in approaches. It restores automatic routing and keeps link colors, without changing speech, conditions, effects or destinations. Undo beautify is available before saving; further manual edits end this shortcut. After saving, use global edit undo.
10. Save dialogue before playing saved content. Switching dialogue, appearance or page invokes the top unsaved-edit panel.

- Editing shared dialogue updates every linked appearance. Create or copy dedicated dialogue when changing only one appearance.

## 8. Batch NPCs and background text

The default batch workflow first creates character profiles and appearances, then shows an NPC group on the level canvas. Every member has separate dialogue for editing and play.

1. Click Add NPC group in the target scene. Set its name, count, identity mix, interval, topics and atmosphere. A batch supports 1–10 members.
2. Create the group and write manually, or create and generate. Characters and appearances exist before requests; failures keep the NPCs.
3. Expand the canvas group to edit each member, open Edit / Play or review candidates. Drag the right edge to resize the control.
4. One generation item represents one NPC. Check that only this member speaks and that content respects the scene and world. Adoption links dialogue to its exact appearance.
5. Cards per NPC includes the opening and every branch card, excluding player choices. Choose 1–6 cards and text length: Short (up to 120 characters), Medium (240) or Detailed (480), including punctuation and spaces. Before submitting, check the member-count × card-count total and per-item output cap. The token cap includes prose, choices and structure; actual usage comes from the provider.
6. Regeneration reuses existing members. Official dialogue remains until a new draft is adopted. Retry failed items separately.
7. Dragging the group header moves scene and time while preserving individual intervals. Saving a shared interval applies it to all members. Dissolving keeps profiles and appearances.

- Advanced anonymous background text creates text only, with no profiles or group control. Use it for notices, rumors or ambience that needs no per-person management.
- A count or length mismatch fails only that item with a specific reason; no extra model call repairs it automatically. Completed drafts and reported usage are retained. Manual retry sends failed items only and keeps their count and length settings. Character and token caps cannot reverse provider charges already incurred.
- Multiple speaker names in background prose do not create characters automatically. Use an NPC group for individually managed villagers.

## 9. Story events, conditions and effects

Story rules live in the level director rather than a separate story canvas. Events wait for conditions after their scheduled time; rules check conditions. Each fires once per rehearsal branch.

1. Add an event to a scene and place it at the desired time. Open Conditions / Effects to set its time, anchor and level/scene scope.
2. Choose conditions such as time reached, variable comparison, character knowledge or another event occurring. Combine All, Any and Negate.
3. Add effects: set variables, increase trust, grant knowledge, change location or behavior, or unlock text. Behavior notes do not replace effects.
4. Moving a bound anchor updates event time. An event past its time but waiting for conditions is not an execution failure.
5. Level story manages local events and rules; Global rules and data manages cross-level definitions. Unscoped legacy definitions remain global.
6. Rehearse the correct level, scene and time. Inspect condition reasons and before/after states in changes. Python validates and executes the effects.

- Periodic schedules and automatic ecology reasoning are not implemented. Authors or their AI must convert prose into explicit conditions and effects for execution.

## 10. Model profiles and API Keys

Manual creation needs no model. Built-in generation requires a compatible chat/completions text endpoint. Several profiles may be enabled; this does not imply automatic model collaboration.

1. Open Model settings and add a profile. Enter a recognizable name, remote/local type, endpoint, model ID and API Key using the provider’s information.
2. Use the compatible service’s base endpoint. HTTP is for local services; remote endpoints use HTTPS. Do not put keys in URLs or story text.
3. Enable streaming or JSON output only if the service supports it. Adjust output limits, timeout and retries; retries can incur usage.
4. Windows defaults to Remember key, encrypted for the current user in local application data and reused next time. Session-only is available; other systems currently use session input.
5. Test connection sends one small request. Save and enable the profile, then assign general and character/story/dialogue/text defaults under Purposes and default models.
6. Override the model for an individual generation task if desired. Submitted jobs retain their original provenance after profile edits or archiving.
7. Copying profiles never copies keys. Changing endpoint, connection type or protocol requires re-entering the key. Clear a profile’s saved key explicitly. Archived profiles can be restored.

- Keys never enter project backups, exports, templates or Skills. Projects share local model settings; no repeated setup is required.
- A successful small test does not guarantee structured generation or creative quality. Remote generation sends selected world and character context to your chosen provider.

## 11. Generation, draft review and retries

A batch usually contains independent targets, not a choose-one competition. Review determines which fields enter your work; generation success alone does not overwrite official content.

1. Generate a story from a specific character, dialogue from a scene NPC group, or profiles through Generate characters. Save first and check the target, model, allowed fields and requirements.
2. Batches contain 1–10 items with at most two concurrent requests. Expand progress or cancel a task; completed drafts remain.
3. Open Draft review and choose Pending, Adopted, Rejected or Failed, or filter by batch. Click a card to open full details.
4. Review text, target character and scene. Expand field differences, conditions and protection as needed. Save candidate edits, then adopt selected fields. Protected fields cannot be overwritten by models.
5. If context changed, compare again against current content and explicitly review stale drafts. Later author edits are not silently overwritten.
6. After adoption, view content in its scene or character. NPC group dialogue links to each member’s appearance; anonymous background text enters scene text only.
7. Failures have no adoptable text. Retry one item or delete its record. Draft and failure deletion is recoverable and does not remove adopted official content.

- Multiple names inside prose do not create multiple characters. One NPC draft should target one NPC; check the displayed target and adoption destination.

## 12. Play, player state and saved records

World rehearsal presents a scene story flow driven by the level canvas and authored entry routes. Default card play in the role workbench tests a specified dialogue card quickly. Both enforce character presence and card/choice conditions.

1. On narrow screens, switch between Edit and Play. Choose appearance and dialogue opens the library. Pane switching preserves author drafts and temporary play state. World rehearsal stays in workspace navigation, with a fixed play icon on small screens.
2. If the content version is outdated, click Load latest project. Pending author edits require save, discard or cancel; failed loading does not silently discard edits. Invalid old paths offer Restart beside the diagnostic.
3. In World rehearsal, the right panel shows characters and NPC groups present in the current scene, time and conditions. Click Conversation, then choose responses on the central card. Characters with no authored dialogue remain visible with a disabled conversation button.
4. Scene entries, triggered events and rules, available environmental text, NPC speech and player responses appear in execution order. Scroll up to inspect earlier content. Each text appears once per scene visit; leaving and revisiting allows it to appear again.
5. Open Player state to select level, scene, time and initial variables, then Apply and restart. Unsaved play prompts you to save, discard or cancel; saved play restarts directly. These settings affect the test, not authored appearances or initial variables.
6. Use Next actions to choose a scene, wait one time unit or advance to the next time anchor. Leaving an unfinished conversation requires confirmation. Its transcript remains and you can resume on return. The existing bottom timeline, changes, generation history and diagnostics keep their functions.
7. Play records in World rehearsal freeze dialogue, environmental text and input conditions. View, delete and restore them here. Replay actions with current content executes the original inputs against the currently saved project without overwriting historical text. Legacy records contain paths only. Project play records filter by level, character card or all sources. The role workbench lists this character’s records and links to project-wide history. Card records replay only in the role workbench.
8. For role-workbench card play, save dialogue, then click Start playing on the right. It starts at the specified card; choose responses to continue. Play again returns to that starting point.
9. For an unavailable choice, read its reason. If it requires Player injured = Yes, enable that variable beside the choice, then try selecting it.
10. Player adjustments keep the current card without executing its entry effects twice. They affect this test only, not author-defined initial variables.
11. Use Verify story entry in More to check real opening routes. If an injured route points to Treat injury, setting injured to true enters that card directly because of the opening rule.
12. To let the player choose treatment from the opening, put the injury condition on the treatment choice rather than an automatic entry route. Card play can test it without deleting official opening rules.
13. Save and name the session in Play records. New records retain the dialogue, choices, initial settings and state snapshots. Click a record to view it.
14. Delete records recoverably, undo or restore from Deleted. Play again against current story reuses original player settings while keeping the old record and text.

- Legacy branches contain inputs and action paths but no historical dialogue snapshots. They are labeled accordingly; old wording cannot be reconstructed.
- If a character is absent, check level, scene, time and appearance conditions. In world replay, fork before adding past actions when future inputs remain.
- Level play uses saved and adopted content without model continuation. The story flow displays at most 2048 frames; a frozen record holds at most 384. Shorten the play scope when it is too long.

## 13. Local files, saving, recovery and moving

Each new project has a same-name folder. Its JSON includes world, characters, dialogue, layouts, drafts and play records. Backups and exports stay together; no external database is required.

1. Choose a parent save location when creating a project. The next project uses that parent rather than nesting inside this project. Renaming a project does not rename its disk folder automatically.
2. Use Project → Open project folder to inspect files. Continue through Open local project, Recent projects, or the folder’s .ludo.json file.
3. Submitted edits save automatically; Ctrl + S also saves. Forms, dialogue and candidate editors require their own Save actions first. Wait for Saved to file before exiting.
4. Save as creates a new file and continues editing it, keeping the original and refusing existing destinations. Legacy single-file projects remain compatible.
5. Organize into a project folder copies the current project and valid backups while preserving originals. Previously downloaded exports must be moved into exports manually.
6. Backup recovery offers the previous valid save and the latest 20 history points. Recovery replaces current content and layout, including unsaved edits, and first backs up the current official file.
7. After saving, copy the entire folder to take the project, backups and exports. Copying only .ludo.json also works but omits history. Open the file at its new location.

```text
My projects/
  Wasteland camp/
    Wasteland camp.ludo.json
    .npcs-project.json
    backups/
      previous.ludo.json
      history/
    exports/
```

- Local profiles, keys and templates live separately and do not move with projects. Keys are encrypted for the Windows user; configure them again on another computer.
- Edit undo is a server-session cache bounded to 30 steps and 8 MB. Use file backups after restart. Closing the browser does not stop the local service.

## 14. Templates and content handoff

Templates copy reusable starting structures. Exports hand off official content or back up a whole project. Neither replaces draft review.

1. Select Templates in the library to preview built-in profiles or dialogue structures. Save your own from existing saved content. The library is shared across projects.
2. Character templates create new profiles without groups, knowledge, appearances or protection flags. Dialogue templates retain text, choices and links but remove source conditions, effects, opening routes and speakers.
3. Choose a character again when applying dialogue templates. Optionally bind a specific appearance so dialogue follows its gate. Review removal counts and new conditions before use.
4. Export Level design notes (Markdown), Dialogue table CSV or Project backup JSON. Notes/tables support a level or the whole project; project backups always contain the whole project.
5. Generate and inspect a preview, then save to project exports or download elsewhere. Repeated folder saves create new filenames. If the project changes, prepare a fresh preview.
6. Notes and tables contain official content only. Backups also include layouts, drafts and records, but exclude templates, profiles and keys.

- Design notes include author secrets and unfiltered global context. Review before sharing with players. CSV is a generic integration table; no dedicated game-engine exporter exists yet.

## 15. Collaborate with your own AI

The Chinese and English Skills help your AI turn stories into visible projects or propose reviewable edits. This collaboration path needs no additional built-in model API Key.

1. Get the complete skills/npcs-ai-studio-zh or skills/npcs-ai-studio-en folder and load it through your AI tool’s supported Skill mechanism. Usually choose one language pack.
2. For a new story project, ask the AI to extract world rules, characters, levels, scenes, appearances and dialogue, list inferred additions, validate and save a separate file. Open it from Project.
3. For an existing project, open it and save your edits first. Ask the AI to read current author context and propose drafts for specific characters or dialogue while preserving confirmed fields.
4. A local AI needs command execution on your computer. Use the Skill bridge script or a recent NPCsAIStudio.exe --skill-bridge against the tool’s actual running URL.
5. Cloud chat without local execution can only deliver content or files for you or a local AI to run. The cloud AI’s localhost is not your computer.
6. Review and adopt proposals in Draft review. On revision conflicts, ask the AI to reread context before proposing again, rather than overwriting from an old snapshot.

```text
Example request:
Use the NPCs AI Studio Skill to turn this story into a separate project.
Extract rules and characters, split level scenes, arrange appearances and dialogue.
List inferred additions, validate, save a new file and tell me how to open it.
```

- The bridge does not auto-adopt, read keys or run arbitrary commands. Single-file Skill outputs can be organized into project folders.

## 16. Troubleshooting and next actions

Distinguish unsubmitted edits, unmet conditions, provider failures and file-save failures. Their remedies differ; do not regenerate an entire project repeatedly.

1. Cannot type in a new choice: click its text or Edit button, enter text in the editor and save. Add choice only creates the row.
2. Injured skips the opening: check whether Verify story entry is active and its injury route targets treatment. Use a choice condition for an active player decision; card play for quick testing.
3. Missing play history: open Play records on the character workbench, check the selected character/dialogue and Deleted records. Unsaved temporary play is not a historical snapshot.
4. Model requests fail: read the reason, check endpoint, model ID, enabled profile, key validity and JSON/streaming support. Retry failed items only; remote retries may incur charges.
5. Local session expired: the page attempts recovery. If it still fails, ensure the local service is running and use the launcher’s actual URL. Exposing the service publicly is not a session fix.
6. Save failure or file conflict: keep page edits and check permissions, disk space and locks. If externally edited, reopen and compare or save a copy rather than overwriting unknown changes.
7. Missing objects: clear search/group/scene filters, fit the canvas and check the selected level or unassigned appearances. Restore deleted records from their Deleted list.
8. Find adopted content: character stories live in profiles, NPC dialogue under group members, and anonymous text in Scene content. Draft count does not imply a count of created characters.

- Structured checks exist, but automatic prose consistency, universal provider support, periodic ecology and dedicated engine exporters are not complete. Windows packages have local checks; clean-machine release acceptance remains outstanding.

## 17. View and add more details

Primary authoring fields remain in their original editors. Optional descriptions and tags are collapsed under More details. Tags do not set conditions or execute story effects.

1. Level canvas → Scenes and time anchors: the level, each anchor and each scene track have More details. Right-click an axis node → Edit to change the same information.
2. NPC group → Settings: expand More details to add a description and tags. Changing names or metadata preserves member intervals; changing the common interval applies it to every member.
3. Event or rule → Author: expand More details for tags. Facts, variables and non-dialogue texts are edited in Story resources. A text description is separate from its body.
4. Role workbench → More details above the dialogue editor: edit the current dialogue’s description and tags, then Save authoring.
5. Project play records or role play records → Legacy record detail → Legacy description and notes → Edit record details: add descriptions, tags and notes. The seed is read only; notes do not change the original conditions, time or action path.
6. Enter one tag per line and use the form’s Save action. Closing a changed form offers Save, Discard or Continue editing.

- Axis colors and icons are canvas markers. Scene NPC groups and the character overview’s tag-based groups are separate.
- Legacy records lack historical dialogue snapshots and show current names. New frozen records remain immutable; replaying creates a separate record.

## 18. Library: edit, locate and delete

The ellipsis beside an item offers actions for its asset type. Single-click and drag-to-canvas behavior is preserved.

1. Level menus open the canvas or settings. Character menus edit profiles, open the role workbench or show relationships. Locations, factions, events, dialogue and text use their dedicated editors.
2. Choose View usages, then select the exact level, scene or appearance. Reused locations are listed separately for each scene. Scene navigation highlights the destination track.
3. Choose Delete, review the type, name and scope, then Confirm deletion. Deleting a level retains shared characters, locations and dialogue. Deleting a character also clears its own initial state.
4. References from appearances, dialogue, plot conditions, rehearsal inputs, drafts or generation records block deletion. Open the listed usages and resolve them first. Hiding a historical record does not remove its references.
5. After deletion, use Undo deletion in the library or the header undo button. A later edit dismisses the shortcut; header undo follows the most recent operation. Saved projects retain recovery points under Project → Backup and recovery.
6. The ellipsis appears on hover or selection and remains visible on touch devices. Tab focuses it, Enter opens the menu, arrow keys select an action and Escape closes it. Collection menus create or manage items; they never delete the entire collection.

- Undo is limited by the current server session, step count and cache size. Use project backups after a restart or when the cache limit is exceeded.
- Frozen play transcript snapshots are retained. Legacy rehearsal inputs and generation history keep reference constraints and are never silently deleted to remove a character.
