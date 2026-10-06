import {t,tm} from './i18n.js';
import {dialoguesFor} from './planning.js';
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const binding=(level,appearance)=>({op:'appearance',level_id:level.id,appearance_id:appearance.id});
export function fixedScope(level,appearance) {
  const track=level.tracks.find(t=>t.id===appearance.track_id);
  return {location_id:track?.location_id,start_tick:appearance.start_tick,end_tick:appearance.end_tick};
}
function scopeTerms(scope) {
  return [{op:'scene',location_id:scope.location_id},{op:'time',comparison:'gte',value:scope.start_tick},{op:'time',comparison:'lte',value:scope.end_tick}];
}
function all(terms) { const rows=terms.filter(c=>c.op!=='always');return rows.length===0?{op:'always'}:rows.length===1?rows[0]:{op:'all',conditions:rows}; }
export function mandatoryTerms(condition) {
  return condition?.op==='all'?condition.conditions.flatMap(mandatoryTerms):condition&& !['any','not','always'].includes(condition.op)?[condition]:[];
}
function stripScope(condition,scopes) {
  if(condition.op==='appearance')return {op:'always'};
  if(condition.op!=='all')return condition;
  let children=[...condition.conditions];
  for(const scope of scopes) {
    if(!scope.location_id)continue;
    const required=scopeTerms(scope),indexes=required.map(term=>children.findIndex(c=>same(c,term)));
    if(indexes.every(i=>i>=0))children=children.filter((_,i)=>!indexes.includes(i));
  }
  return all(children.map(c=>stripScope(c,scopes)));
}
function walk(condition,replace) {
  const changed=replace(condition);if(changed!==condition)return changed;
  if(condition.op==='all'||condition.op==='any')return {...condition,conditions:condition.conditions.map(c=>walk(c,replace))};
  if(condition.op==='not')return {...condition,condition:walk(condition.condition,replace)};
  return condition;
}
export function dialogueUses(content,graphId) {
  return content.levels.flatMap(level=>level.appearances.filter(a=>dialoguesFor(content,a).some(g=>g.id===graphId)).map(appearance=>({level,appearance})));
}
function knownScopes(content,level,appearance,graph) {
  return [fixedScope(level,appearance),...content.drafts.filter(d=>d.status==='accepted'&&d.target?.id===graph.id&&d.scene_context?.level_id===level.id&&d.scene_context.appearance_id===appearance.id).map(d=>d.scene_context)];
}
export function followNodes(content,level,appearance,graph) {
  const gate=binding(level,appearance), scopes=knownScopes(content,level,appearance,graph);
  return graph.nodes.map(n=>{
    const rest=stripScope(n.condition,scopes);
    return {...n,condition:mandatoryTerms(rest).some(c=>same(c,gate))?rest:all([gate,rest])};
  });
}
export function independentNodes(level,appearance,graph) {
  const gate=binding(level,appearance),scope=fixedScope(level,appearance);
  if(!scope.location_id)throw new Error(t("请先为这次出场安排场景，再解除联动"));
  const frozen=all([...scopeTerms(scope),appearance.condition]);
  return graph.nodes.map(n=>({...n,condition:walk(n.condition,c=>same(c,gate)?frozen:c)}));
}
export function dialogueCheck(content,level,appearance,graph) {
  const gate=binding(level,appearance),scope=fixedScope(level,appearance),problems=[];
  let followed=0;
  for(const node of graph.nodes) {
    const terms=mandatoryTerms(node.condition);
    if(terms.some(c=>same(c,gate)))followed++;
    if(terms.some(c=>c.op==='scene'&&c.location_id!==scope.location_id))problems.push(`${node.label||'对白卡片'}的固定场景与当前出场不一致`);
    let low=appearance.start_tick,high=appearance.end_tick;
    for(const t of terms.filter(c=>c.op==='time')) {
      if(['gte','gt','eq'].includes(t.comparison))low=Math.max(low,t.value+(t.comparison==='gt'?1:0));
      if(['lte','lt','eq'].includes(t.comparison))high=Math.min(high,t.value-(t.comparison==='lt'?1:0));
    }
    if(low>high)problems.push(`${node.label||'对白卡片'}的固定时间与出场范围没有交集`);
    if(terms.some(c=>c.op==='appearance'&&!same(c,gate)))problems.push(`${node.label||'对白卡片'}跟随了其他出场，请核对复用关系`);
    const original=knownScopes(content,level,appearance,graph).slice(1).find(s=>scopeTerms(s).every(term=>terms.some(c=>same(c,term))));
    if(original&&(original.location_id!==scope.location_id||original.start_tick!==scope.start_tick||original.end_tick!==scope.end_tick))problems.push(`${node.label||'对白卡片'}仍使用生成时的固定出场范围`);
  }
  if(!scope.location_id)problems.unshift('这次出场尚未安排场景');
  return {problems:[...new Set(problems)],following:followed===graph.nodes.length,uses:dialogueUses(content,graph.id).length,scope};
}
export function levelDialogueChecks(content,level) {
  return level.appearances.flatMap(appearance=>dialoguesFor(content,appearance).map(graph=>({appearance,graph,...dialogueCheck(content,level,appearance,graph)})));
}
export function linkageCommands(content,level,appearance,graph,mode,makeId) {
  if(graph.character_id&&graph.character_id!==appearance.character_id)throw new Error(t("对白人物与出场不一致"));
  const nodes=mode==='follow'?followNodes(content,level,appearance,graph):independentNodes(level,appearance,graph);
  if(same(nodes,graph.nodes))return [];
  if(mode==='follow'&&dialogueUses(content,graph.id).length>1) {
    const id=makeId('dialogue');
    const ids=dialoguesFor(content,appearance).map(g=>g.id===graph.id?id:g.id);
    return [{type:'create_entity',entity:{...graph,id,name:`${graph.name.slice(0,120)} · 本次出场`,nodes}}, {type:'put_level',level:{...level,appearances:level.appearances.map(a=>a.id===appearance.id?{...a,dialogue_ids:ids}:a)}}];
  }
  return [{type:'patch_entity',target:{kind:'dialogue',id:graph.id},changes:{nodes}}];
}
