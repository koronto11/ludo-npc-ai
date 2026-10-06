import { dialoguesFor } from './planning.js';
import { t } from './i18n.js';

// Visibility comes from Python's presence result, never from an author note.
export function sceneCast(content, result) {
  const level=content.levels.find(l=>l.id===result?.level_id);
  if(!level)return {level:null,people:[],groups:[]};
  const visible=new Set((result.appearances || []).filter(a=>a.reason.passed).map(a=>a.id));
  const byActor=new Map();
  for(const appearance of level.appearances.filter(a=>visible.has(a.id))){
    const actor=content.characters.find(a=>a.id===appearance.character_id);
    if(!actor)continue;
    const key=`${appearance.npc_group_id || ''}:${actor.id}`;
    const row=byActor.get(key) || {actor,appearances:[],dialogues:[],groupId:appearance.npc_group_id || null};
    row.appearances.push(appearance);
    for(const graph of dialoguesFor(content,appearance)){
      const runtime=result.dialogues.find(d=>d.id===graph.id);
      if(runtime&&!row.dialogues.some(d=>d.id===graph.id))row.dialogues.push(runtime);
    }
    byActor.set(key,row);
  }
  const rows=[...byActor.values()];
  return {level,people:rows.filter(a=>!a.groupId),groups:(level.npc_groups || []).map(group=>({...group,members:rows.filter(a=>a.groupId===group.id)})).filter(g=>g.members.length)};
}
export function freshStoryBranch(content,levelId,locationId,tick,variables={},makeId=()=>`branch-${crypto.randomUUID()}`){
  const level=content.levels.find(l=>l.id===levelId);
  const scene=level?.tracks.find(t=>t.location_id===locationId) || level?.tracks.find(t=>t.location_id);
  return {id:makeId(),name:level?.name || '关卡试玩',level_id:level?.id || null,location_id:scene?.location_id || null,at_tick:Math.max(content.initial_state.tick,Math.trunc(Number(tick)||0)),variable_overrides:{...variables},choices:[],scene_changes:[],seed:0,notes:''};
}
export function frozenStoryFrames(result){
  const labels={scene:t('进入场景'),environment:t('环境文本'),event:t('剧情事件'),rule:t('剧情规则')};
  return (result.story_flow || []).map(frame=>({kind:frame.kind,label:frame.presentation?`${labels[frame.presentation] || t('状态变化')} · ${frame.label}`:frame.label || '',text:frame.text || '',node_id:frame.node_id || null,speaker:frame.speaker || '',tick:frame.tick}));
}
export function savedStoryInputs(branch){
  return structuredClone({at_tick:branch.at_tick,level_id:branch.level_id || null,location_id:branch.location_id || null,variable_overrides:branch.variable_overrides,choices:branch.choices,scene_changes:branch.scene_changes || [],card_trial:null});
}
export function hasFutureInputs(branch){return [...branch.choices,...(branch.scene_changes || [])].some(a=>a.tick>branch.at_tick);}
