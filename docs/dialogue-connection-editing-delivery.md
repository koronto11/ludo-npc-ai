# Dialogue connection editing

Selected role-workbench connections have a destination selector and a visible target-only reconnect ring. Destinations distinguish ordinary dialogue cards, named NPC ending nodes and the legacy direct exit. Both entry rules and player choices can be retargeted. A cancelled or invalid drag retains the original connection without dirtying the draft.

Retargeting preserves source identity, player choice text, conditions, effects and link color. It clears only the changed link's obsolete custom routing points. Entry-route retargeting preserves other route markings. Edits use the existing draft, sparse conflict-protected save, unsaved-navigation guard and shared saved-edit undo.

Connections are derived from player choices and entry rules. They are not independent author records. Deleting a player connection explicitly confirms deletion of its source choice, including its conditions and effects. Deleting a conditional entry connection confirms removal of that rule. Destination cards remain intact. The default entry is mandatory and can be retargeted but cannot be deleted. There is no new disconnected-choice state or persisted project format.

Settings occupy a separate canvas-side column so they do not cover target ports. On narrow screens they occupy a scrollable area below the canvas. Color and routing controls remain available. Chinese and English labels and help describe the same behavior.

Validation: five semantic edge tests cover preserved choice data, named and direct endings, entry guards, scoped branch removal and invalid connections. The frontend suite passed 193 tests and the production build passed. An isolated local project verified target selection, real mouse endpoint dragging, cancellation, confirmed option and conditional-entry deletion, target-card retention, save/undo restoration, default-entry protection, English controls and narrow-screen non-overlap. Tests made no provider requests and did not modify the user's project.
