// Controlled nodes must retain measured sizes, or React Flow hides and remeasures them.
export function updateDialogueNodeState(state, changes) {
  let next = state;
  for (const change of changes) {
    const previous = next[change.id] || {};
    let patch;
    if (change.type === 'dimensions' && change.dimensions &&
        (previous.measured?.width !== change.dimensions.width || previous.measured?.height !== change.dimensions.height)) {
      patch = { measured: { ...change.dimensions } };
    } else if (change.type === 'position' && typeof change.dragging === 'boolean' && previous.dragging !== change.dragging) {
      patch = { dragging: change.dragging };
    }
    if (patch) {
      if (next === state) next = { ...state };
      next[change.id] = { ...previous, ...patch };
    }
  }
  return next;
}
