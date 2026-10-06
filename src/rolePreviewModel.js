import {t} from './i18n.js';
// Follow failed branches only: a successful OR may contain failed children.
export function blockingReasons(reason) {
  if (!reason || reason.passed) return [];
  if (reason.reason === '条件取反') return ['取反条件未满足'];
  const children = (reason.children || []).filter(child => !child.passed);
  return children.length ? children.flatMap(blockingReasons) : [reason.reason || '条件未满足'];
}
export function shortBlockedReason(reason) {
  const reasons = blockingReasons(reason);
  const first = reasons[0] || '当前对白条件未满足';
  const match = first.match(/^(.+): (.+) = (.+)$/);
  const text = match ? t('需要“{0}”为{1}（当前为{2}）',[match[1],['是','否'].includes(match[3])?t(match[3]):match[3],['是','否'].includes(match[2])?t(match[2]):match[2]]) : first;
  return reasons.length>1?t('{0}；另有 {1} 项条件',[text,reasons.length-1]):text;
}
export function previewStatus(active, { busy, error, complete, authorDirty } = {}) {
  if (authorDirty) return { label:'编排未保存', kind:'warning' };
  if (busy) return { label:'计算中', kind:'pending' };
  if (error || complete === false) return { label:'预演异常', kind:'warning' };
  if (!active) return { label:'暂无对白', kind:'pending' };
  if (active.closed) return { label:'已结束', kind:'finished' };
  if (!active.available) return { label:'条件未满足', kind:'warning' };
  return { label:active.started ? '进行中' : '待开始', kind:active.started ? 'playing' : 'pending' };
}
export function canPlay(active, { busy, error, complete, authorDirty, saving } = {}) {
  return !!active && !!complete && !busy && !error && !authorDirty && !saving && !!(active.available || active.closed);
}

export function testSettings(branch, result) {
  return { at_tick:branch.at_tick, location_id:result?.state ? result.state.scene_id : branch.location_id ?? null, variable_overrides:{...branch.variable_overrides} };
}
export function settingsChanged(current, pending) {
  if (!current || !pending) return false;
  const keys = new Set([...Object.keys(current.variable_overrides),...Object.keys(pending.variable_overrides)]);
  return current.at_tick !== pending.at_tick || current.location_id !== pending.location_id || [...keys].some(key=>current.variable_overrides[key]!==pending.variable_overrides[key]);
}
// A fresh test never rewrites an existing saved branch or reuses its choices.
export function newTestBranch(branch, settings, dialogueId, branchId, recordId) {
  return { ...structuredClone(branch), id:branchId, name:'角色场景测试', at_tick:settings.at_tick, location_id:settings.location_id, variable_overrides:{...settings.variable_overrides}, scene_changes:[], choices:[{tick:settings.at_tick,dialogue_id:dialogueId,option_id:null,action:'start',sequence:0,record_id:recordId}] };
}
export function validateTestSettings(settings, content) {
  if (!Number.isInteger(settings.at_tick) || settings.at_tick < content.initial_state.tick) return `故事时间需为不小于 ${content.initial_state.tick} 的整数`;
  for (const variable of content.variables) {
    const value=settings.variable_overrides[variable.id];
    if(value!==undefined && variable.value_type==='number' && (typeof value!=='number' || !Number.isFinite(value))) return `${variable.name}需要填写有效数字`;
  }
  return '';
}
