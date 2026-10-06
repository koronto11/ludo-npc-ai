import {t,tm} from './i18n.js';
export const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
export const clone = value => structuredClone(value);
export const appearancesFor = (content, characterId) => (content.levels || []).flatMap(level => level.appearances.filter(a => a.character_id === characterId).map(appearance => ({ level, appearance, track: level.tracks.find(t => t.id === appearance.track_id) })));
export const dialoguesFor = (content, appearance) => content.dialogues.filter(d => appearance.dialogue_ids.length ? appearance.dialogue_ids.includes(d.id) : d.character_id === appearance.character_id);
export function moveAnchor(level, id, tick) {
  tick = Math.max(0, Math.round(tick));
  const next = { ...level, anchors: level.anchors.map(a => a.id === id ? { ...a, tick } : a), appearances: level.appearances.map(a => ({ ...a, ...(a.start_anchor_id === id ? { start_tick: tick } : {}), ...(a.end_anchor_id === id ? { end_tick: tick } : {}) })) };
  if (next.appearances.some(a => a.end_tick < a.start_tick)) throw new Error(t("这个锚点移动后会使出场结束早于开始，请先调整出场范围"));
  return next;
}
export function removeAnchor(level, id) {
  return { ...level, anchors: level.anchors.filter(a => a.id !== id), appearances: level.appearances.map(a => ({ ...a, start_anchor_id: a.start_anchor_id === id ? null : a.start_anchor_id, end_anchor_id: a.end_anchor_id === id ? null : a.end_anchor_id })) };
}
export function removeTrack(level, id) {
  return { ...level, tracks: level.tracks.filter(t => t.id !== id), ...(level.npc_groups?{npc_groups:level.npc_groups.filter(g=>g.track_id!==id)}:{}), appearances: level.appearances.map(a => a.track_id === id ? { ...a, track_id: null, ...(a.npc_group_id?{npc_group_id:null}:{}) } : a) };
}
export function placeAppearance(level, appearance, start, end, trackId) {
  start = Math.max(0, Math.round(start)); end = Math.max(start, Math.round(end));
  const bind = tick => level.anchors.find(a => a.tick === tick)?.id || null;
  const sameTime = level.appearances.some(a => a.id === appearance.id) && start === appearance.start_tick && end === appearance.end_tick;
  const row = { ...appearance, ...(appearance.npc_group_id&&level.npc_groups?.find(g=>g.id===appearance.npc_group_id)?.track_id!==trackId?{npc_group_id:null}:{}), start_tick: start, end_tick: end, track_id: trackId || null, start_anchor_id: sameTime ? appearance.start_anchor_id : bind(start), end_anchor_id: sameTime ? appearance.end_anchor_id : bind(end) };
  return { ...level, appearances: level.appearances.some(a => a.id === row.id) ? level.appearances.map(a => a.id === row.id ? row : a) : [...level.appearances, row] };
}
export function newAppearance(characterId) {
  return { id: uid('appearance'), character_id: characterId, track_id: null, start_tick: 0, end_tick: 0, start_anchor_id: null, end_anchor_id: null, condition: { op: 'always' }, dialogue_ids: [], behavior: '' };
}
export function conditionLabel(value, content) {
  const name = id => Object.values(content).filter(Array.isArray).flat().find(r => r.id === id)?.name || id;
  if (!value || value.op === 'always') return t('无额外条件');
  if (['all', 'any'].includes(value.op)) return value.conditions.map(c => conditionLabel(c, content)).join(value.op === 'all' ? t(' 且 ') : t(' 或 '));
  if (value.op === 'not') return t('不满足：{0}',[conditionLabel(value.condition,content)]);
  if (value.op === 'variable') return `${name(value.variable_id)} ${{eq:'=',ne:'≠',gt:'>',gte:'≥',lt:'<',lte:'≤'}[value.comparison]} ${typeof value.value==='boolean' ? value.value?t('是'):t('否') : String(value.value)}`;
  if (value.op === 'time') return t('时间 {0} {1}',[{eq:'=',ne:'≠',gt:'>',gte:'≥',lt:'<',lte:'≤'}[value.comparison],value.value]);
  if (value.op === 'appearance') { const level=content.levels.find(l=>l.id===value.level_id),a=level?.appearances.find(a=>a.id===value.appearance_id);return a?t('跟随 {0} · {1}',[name(a.character_id),appearanceLabel(level,a)]):t('关联出场已移除'); }
  if (value.op === 'scene') return t('场景：{0}',[name(value.location_id)]);
  if (value.op === 'knows') return t('{0}知道{1}',[name(value.character_id),name(value.fact_id)]);
  if (value.op === 'at_location') return t('{0}位于{1}',[name(value.character_id),name(value.location_id)]);
  return t('事件：{0}',[name(value.event_id)]);
}
export function appearanceLabel(level, appearance) {
  const time = tick => level.axis_mode === 'phase' ? level.anchors.find(a => a.tick === tick)?.name || t('进度 {0}',[tick]) : t('时间 {0}',[tick]);
  return `${level.name} · ${level.tracks.find(t => t.id === appearance.track_id)?.name || t('待安排场景')} · ${time(appearance.start_tick)} → ${time(appearance.end_tick)}`;
}
