export const plotRows = content => [...content.events, ...content.rules];
export const plotActors = row => [...new Set([...(row.affected_character_ids || []), ...row.effects.map(effect => effect.character_id).filter(Boolean)])];
export function plotScopeLabel(row, content) {
  if (!row.scope) return '全局';
  const level = content.levels.find(level => level.id === row.scope.level_id);
  return `${level?.name || '未知关卡'} · ${level?.tracks.find(track => track.id === row.scope.track_id)?.name || '整个关卡'}`;
}
export function movePlotEvent(row, level, tick, trackId) {
  tick = Math.max(0, Math.round(tick));
  return { scheduled_at:tick, scope:{level_id:level.id,track_id:trackId || null}, anchor_id:tick===row.scheduled_at ? row.anchor_id ?? null : level.anchors.find(anchor => anchor.tick === tick)?.id || null };
}
export const plotsForActor = (content, id) => plotRows(content).filter(row => plotActors(row).includes(id));
