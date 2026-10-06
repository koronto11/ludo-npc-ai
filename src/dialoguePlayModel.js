import {t,tm} from './i18n.js';
export function variableIds(condition, found = new Set()) {
  if (!condition) return found;
  if (condition.op === 'variable') found.add(condition.variable_id);
  if (condition.condition) variableIds(condition.condition, found);
  for (const child of condition.conditions || []) variableIds(child, found);
  return found;
}
export function dialogueVariableIds(graph) {
  const found = new Set();
  for (const node of graph?.nodes || []) {
    variableIds(node.condition, found);
    for (const option of node.options) variableIds(option.condition, found);
    for (const effect of [...node.effects, ...node.options.flatMap(o=>o.effects)]) if (effect.variable_id) found.add(effect.variable_id);
  }
  return found;
}
export function playInputs(content, graph, level, appearance) {
  return {at_tick:Math.max(content.initial_state.tick,appearance?.start_tick ?? content.initial_state.tick),location_id:level?.tracks.find(t=>t.id===appearance?.track_id)?.location_id || null,level_id:level?.id || null,variable_overrides:{},choices:[],scene_changes:[],card_trial:{dialogue_id:graph.id,start_node_id:null,use_entry_routes:false,started:false,actions:[]}};
}
export function appendPlayerState(inputs, variableId, value) {
  if (!inputs.card_trial) throw new Error(t("旧记录重放期间不能修改玩家状态，请开始新的试玩"));
  return inputs.card_trial.started ? {...inputs,card_trial:{...inputs.card_trial,actions:[...inputs.card_trial.actions,{type:'variable',variable_id:variableId,value}]}} : {...inputs,variable_overrides:{...inputs.variable_overrides,[variableId]:value}};
}
export function restartPlay(inputs, graphId, overrides, nodeId = null, useEntryRoutes = false) {
  return {...structuredClone(inputs),variable_overrides:{...overrides},choices:[],scene_changes:[],card_trial:{dialogue_id:graphId,start_node_id:nodeId,use_entry_routes:useEntryRoutes,started:true,actions:[]}};
}
export function recordDialogueId(record) {
  return record.dialogue_id || record.inputs?.card_trial?.dialogue_id || record.inputs?.choices?.at(-1)?.dialogue_id || record.choices?.at(-1)?.dialogue_id;
}
export function replayRecordInputs(record, fallbackDialogueId) {
  const source=record.inputs;
  const variables={...source.variable_overrides,...Object.fromEntries((source.card_trial?.actions || []).filter(a=>a.type==='variable').map(a=>[a.variable_id,a.value]))};
  return restartPlay(source,recordDialogueId(record) || fallbackDialogueId,variables,source.card_trial?.start_node_id || null,source.card_trial?.use_entry_routes ?? true);
}
export function legacyRecord(caseRow, content) {
  const graph = content.dialogues.find(g=>g.id===recordDialogueId(caseRow));
  return {id:caseRow.id,name:caseRow.name,legacy:true,character_id:graph?.character_id,dialogue_id:graph?.id,character_name:content.characters.find(c=>c.id===graph?.character_id)?.name || '全局测试',dialogue_name:graph?.name || '多对白测试',scene_name:content.locations.find(l=>l.id===caseRow.location_id)?.name || '未指定场景',created_at:null,inputs:{at_tick:caseRow.at_tick,location_id:caseRow.location_id,level_id:caseRow.level_id || null,variable_overrides:{...caseRow.variable_overrides},choices:structuredClone(caseRow.choices),scene_changes:structuredClone(caseRow.scene_changes || []),card_trial:null},transcript:[]};
}

export function playRecordKey(record) {
  return `${record.legacy?'simulation_case':'play_record'}:${record.id}`;
}
export function playRecordLists(document) {
  if (!document) return {active:[],deleted:[]};
  const deleted = new Set((document.editor.deleted_play_records || []).map(row=>`${row.source}:${row.record_id}`));
  const records=[...(document.editor.play_records || []).slice().reverse(),...document.content.simulation_cases.map(row=>legacyRecord(row,document.content))];
  return {active:records.filter(row=>!deleted.has(playRecordKey(row))),deleted:records.filter(row=>deleted.has(playRecordKey(row)))};
}
export function characterPlayRecordLists(document, characterId) {
  const lists=playRecordLists(document);
  const belongs=row=>row.character_id===characterId && (!!row.inputs.card_trial || row.legacy);
  return {active:lists.active.filter(belongs),deleted:lists.deleted.filter(belongs)};
}
export function activeSimulationCases(document) {
  const deleted=new Set((document.editor.deleted_play_records || []).filter(row=>row.source==='simulation_case').map(row=>row.record_id));
  return document.content.simulation_cases.filter(row=>!deleted.has(row.id));
}
