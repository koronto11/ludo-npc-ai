export const controlKey = (kind, id) => `${kind === 'npc-group' ? 'group' : kind}:${id}`;

// Missing/new controls retain the legacy order until the author moves one.
export function levelControlKeys(level, events) {
  return [
    ...events.map(row => controlKey('event', row.id)),
    ...level.appearances.filter(row => !row.npc_group_id).map(row => controlKey('appearance', row.id)),
    ...(level.npc_groups || []).map(row => controlKey('group', row.id)),
  ];
}

export function layoutControls(controls, savedOrder = [], heights = {}, minimumHeight = 208) {
  const ranks = new Map(savedOrder.map((key, index) => [key, index]));
  const sorted = controls.map((row, index) => ({ ...row, rank: ranks.get(row.key) ?? savedOrder.length + index }))
    .sort((a, b) => a.rank - b.rank);
  let bottom = 20;
  const rows = sorted.map(row => {
    const top = bottom;
    const height = heights[row.key] ?? row.height;
    bottom += height + 12;
    return { ...row, top, height };
  });
  return { rows, positions: Object.fromEntries(rows.map(row => [row.key, row.top])), height: Math.max(208, minimumHeight, bottom + 8) };
}

export function insertionPoint(rows, movingKey, y) {
  const siblings = rows.filter(row => row.key !== movingKey);
  const before = siblings.find(row => y < row.top + row.height / 2);
  return { before: before?.key ?? null, top: before ? Math.max(8, before.top - 6) : siblings.length ? siblings.at(-1).top + siblings.at(-1).height + 6 : 14 };
}

export function reorderedControls(savedOrder, allKeys, movingKey, siblings, before) {
  const allowed = new Set(allKeys);
  const order = [...savedOrder.filter(key => allowed.has(key)), ...allKeys.filter(key => !savedOrder.includes(key))];
  const without = order.filter(key => key !== movingKey);
  // An empty scene has no sibling: its position in the global sequence is immaterial.
  const after = siblings.filter(key => key !== movingKey).at(-1);
  const at = before ? without.indexOf(before) : after ? without.indexOf(after) + 1 : without.length;
  without.splice(at < 0 ? without.length : at, 0, movingKey);
  return without;
}

export function dragDelta(start, point, scroll) {
  return { dx: point.x - start.x + scroll.left - start.scrollLeft, dy: point.y - start.y + scroll.top - start.scrollTop };
}

export function dragTimeDelta(value, scale, enabled) {
  // Small horizontal wobble during a vertical arrangement must not shift story time.
  if (!enabled || value.layoutMove || (!value.edge && !['anchor','control-width'].includes(value.kind) && Math.abs(value.dy) > Math.abs(value.dx) * 3)) return 0;
  return Math.round(value.dx / scale);
}

export function edgeScroll(point, rect, rulerHeight = 84) {
  const speed = (value, low, high) => value < low + 32 ? -Math.ceil(Math.min(1, (low + 32 - value) / 32) * 14)
    : value > high - 32 ? Math.ceil(Math.min(1, (value - high + 32) / 32) * 14) : 0;
  if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return { x: 0, y: 0 };
  return { x: speed(point.x, rect.left + 168, rect.right), y: speed(point.y, rect.top + rulerHeight, rect.bottom) };
}
