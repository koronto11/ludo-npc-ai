import {dialoguesFor} from './planning.js';
import {libraryDeleteBlockers} from './libraryActionsModel.js';

export function dialogueAppearances(document, graphId) {
  return document.content.levels.flatMap(level=>level.appearances
    .filter(appearance=>dialoguesFor(document.content,appearance).some(graph=>graph.id===graphId))
    .map(appearance=>({level,appearance,key:`${level.id}:${appearance.id}`})));
}

export const dialogueRemovalBlockers = (document, id) => libraryDeleteBlockers(document,{kind:'dialogue',id}).filter(row=>row.kind!=='appearance');
const signature = rows => JSON.stringify(rows.map(({key,appearance})=>[key,appearance.character_id,appearance.dialogue_ids,appearance.inherit_dialogues!==false]).sort((a,b)=>a[0].localeCompare(b[0])));

export function roleDialogueRemovalCommands(base, request, latest) {
  const before=base.content.dialogues.find(graph=>graph.id===request.graphId);
  const current=latest.content.dialogues.find(graph=>graph.id===request.graphId);
  if(base.project_id!==latest.project_id || !before || !current)throw new Error('对白已移除或所属项目已变化，请重新打开菜单。');
  if(JSON.stringify(before)!==JSON.stringify(current))throw new Error('对白已被修改，请核对最新内容后重新确认。');
  const allBefore=dialogueAppearances(base,request.graphId),allNow=dialogueAppearances(latest,request.graphId);
  const affected=rows=>request.mode==='unlink'?rows.filter(row=>row.key===request.sceneKey):rows;
  if(signature(affected(allBefore))!==signature(affected(allNow)))throw new Error('对白出场关联已变化，请核对最新内容后重新确认。');
  const rows=affected(allNow);
  if(request.mode==='unlink'&&!rows.length)throw new Error('本次出场已不再使用这份对白。');
  if(request.mode!=='unlink'&&request.mode!=='delete')throw new Error('请选择移除关联或删除对白。');
  if(request.mode==='delete'&&dialogueRemovalBlockers(latest,request.graphId).length)throw new Error('对白仍被草稿、生成记录或剧情资料引用，请先处理关联。');
  const keys=new Set(rows.map(row=>row.key));
  const commands=latest.content.levels.filter(level=>rows.some(row=>row.level.id===level.id)).map(level=>({type:'put_level',level:{...level,appearances:level.appearances.map(appearance=>keys.has(`${level.id}:${appearance.id}`)?{
    ...appearance,inherit_dialogues:false,dialogue_ids:dialoguesFor(latest.content,appearance).filter(graph=>graph.id!==request.graphId).map(graph=>graph.id),
  }:appearance)}}));
  if(request.mode==='delete')commands.push({type:'delete_entity',target:{kind:'dialogue',id:request.graphId}});
  return commands;
}
