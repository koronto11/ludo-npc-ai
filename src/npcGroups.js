import {t,tm} from './i18n.js';
import {isEntryDeleted} from './draftReviewModel.js';
import {dialoguesFor,placeAppearance} from './planning.js';

export function npcGroupMembers(document,level,group){
  const content=document.content;
  return level.appearances.filter(a=>a.npc_group_id===group.id).map(appearance=>{
    const actor=content.characters.find(c=>c.id===appearance.character_id);
    const dialogues=dialoguesFor(content,appearance).filter(g=>g.character_id===actor?.id);
    const drafts=content.drafts.filter(d=>d.status==='pending'&&d.scene_context?.appearance_id===appearance.id&&d.scene_context.level_id===level.id&&!isEntryDeleted(document.editor,{source:'draft',record_id:d.id,item_index:null})).reverse();
    const jobs=content.generation_history.flatMap(job=>(job.items || []).flatMap((item,index)=>item.scene_context?.appearance_id===appearance.id&&item.scene_context.level_id===level.id&&!isEntryDeleted(document.editor,{source:'failed_item',record_id:job.id,item_index:index})?[{job,item,index}]:[]));
    const latest=jobs.at(-1);
    const failure=latest?.item.status==='failed'?latest:null;
    const generating=!!latest&&['queued','running'].includes(latest.item.status);
    const lines=dialogues.flatMap(g=>g.nodes).filter(n=>n.speaker_id===actor?.id||!n.speaker_id).length;
    return {appearance,actor,dialogues,drafts,failure,generating,lines,status:generating?'生成中':failure?'生成失败':drafts.length?'待审核':dialogues.length?'已配置':'待写台词',preview:dialogues[0]?.nodes.find(n=>n.id===dialogues[0].entry_node_id)?.text || drafts[0]?.patch.nodes?.[0]?.text || '尚未填写台词'};
  });
}
export function npcGroupBounds(level,group){
  const members=level.appearances.filter(a=>a.npc_group_id===group.id);
  return {start:members.length?Math.min(...members.map(a=>a.start_tick)):0,end:members.length?Math.max(...members.map(a=>a.end_tick)):0};
}
export function moveNpcGroup(level,groupId,delta,trackId){
  const group=level.npc_groups.find(g=>g.id===groupId);
  if(!group||!level.tracks.some(t=>t.id===trackId))throw new Error(t("NPC 组或目标场景已不存在"));
  delta=Math.max(-npcGroupBounds(level,group).start,Math.round(delta));
  let next={...level,npc_groups:level.npc_groups.map(g=>g.id===groupId?{...g,track_id:trackId}:g)};
  for(const a of level.appearances.filter(a=>a.npc_group_id===groupId))next=placeAppearance(next,a,a.start_tick+delta,a.end_tick+delta,trackId);
  return next;
}
export function groupGenerationItems(content,level,group){
  const track=level.tracks.find(t=>t.id===group.track_id);
  return level.appearances.filter(a=>a.npc_group_id===group.id).map(a=>{
    const actor=content.characters.find(c=>c.id===a.character_id);
    if(!actor||!track)throw new Error(t("NPC 组成员或场景已不存在"));
    const graph=dialoguesFor(content,a).find(g=>g.character_id===actor.id);
    const fields=(graph?['entry_node_id','entry_routes','nodes']:['name','description','character_id','entry_node_id','entry_routes','nodes']).filter(f=>!graph?.confirmed_fields?.includes(f));
    if(graph?.confirmed_fields?.includes('nodes'))throw new Error(t("{0} 的台词已确认保护，请先在人物工作台调整保护设置", [actor.name]));
    return {kind:'dialogue',name:`${actor.name} · 场景闲聊`,...(graph?{target_id:graph.id}:{}),character_id:actor.id,scene_id:track.location_id,start_tick:a.start_tick,end_tick:a.end_tick,scene_context:{level_id:level.id,track_id:track.id,location_id:track.location_id,appearance_id:a.id,group_name:group.name,mode:'people',start_tick:a.start_tick,end_tick:a.end_tick},fields};
  });
}
export function groupDialogueCommands(content,level,appearance,graph,nodes,makeId){
  if(graph)return [{type:'patch_entity',target:{kind:'dialogue',id:graph.id},changes:{nodes}}];
  const actor=content.characters.find(c=>c.id===appearance.character_id), identifier=makeId('dialogue');
  const entity={id:identifier,kind:'dialogue',name:`${actor.name} · 场景闲聊`,character_id:actor.id,entry_node_id:nodes[0].id,entry_routes:[],nodes};
  const existing=(appearance.dialogue_ids.length?appearance.dialogue_ids:content.dialogues.filter(g=>!g.character_id||g.character_id===appearance.character_id).map(g=>g.id));
  return [{type:'create_entity',entity},{type:'put_level',level:{...level,appearances:level.appearances.map(a=>a.id===appearance.id?{...a,dialogue_ids:[...existing,identifier]}:a)}}];
}
