import {t,tm} from './i18n.js';
import { isEntryDeleted } from './draftReviewModel.js';
export const sceneTextLengths = {short:120, medium:240, long:480};
export function withSceneOutputLimits(items,cardCount,textLength) {
  if(!Number.isInteger(cardCount)||cardCount<1||cardCount>6)throw new Error(t("每人对白卡片数需为 1–6 张"));
  if(!Object.hasOwn(sceneTextLengths,textLength))throw new Error(t("请选择台词长度"));
  return items.map(item=>({...item,output_limits:{card_count:item.kind==='dialogue'?cardCount:null,text_length:textLength}}));
}
export function sceneOutputTokenCap(profile,cardCount,textLength) {
  const maximum=sceneTextLengths[textLength];
  return Math.min(profile.max_tokens,512+cardCount*(2*maximum+384));
}
export function crowdNames(groupName, roles, count) {
  const occupations=roles.split(/[、,，\n]/).map(s=>s.trim()).filter(Boolean);
  if(!groupName.trim() || !occupations.length)throw new Error(t("填写组名和至少一种居民身份"));
  if(!Number.isInteger(count)||count<1||count>10)throw new Error(t("每批生成 1–10 项"));
  return Array.from({length:count},(_,i)=>({role:occupations[i%occupations.length],name:`${groupName.trim().slice(0,70)} · ${occupations[i%occupations.length].slice(0,35)} ${String(i+1).padStart(2,'0')}`}));
}
export function crowdPlan(content,level,track,settings,makeId) {
  const {mode,count,groupName,roles,tone,start,end}=settings;
  if(!['pool','people'].includes(mode))throw new Error(t("选择生成方式"));
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<content.initial_state.tick||end<start)throw new Error(t("填写有效的开始、结束时间"));
  const current=content.levels.find(l=>l.id===level.id);
  if(!current?.tracks.some(t=>t.id===track.id&&t.location_id===track.location_id))throw new Error(t("场景已修改，请重新打开批量生成窗口"));
  const next=structuredClone(current), commands=[],items=[];
  const group=mode==='people'?{id:makeId('npc-group'),name:groupName.trim(),track_id:track.id}:null;
  if(group)next.npc_groups=[...(next.npc_groups || []),group];
  for(const {name,role} of crowdNames(groupName,roles,count)) {
    const actorId=mode==='people'?makeId('character'):null;
    const appearanceId=actorId?makeId('appearance'):null;
    if(actorId){commands.push({type:'create_entity',entity:{id:actorId,kind:'character',name,role,importance:'background',tags:[groupName.trim()],voice:tone}});next.appearances.push({id:appearanceId,character_id:actorId,npc_group_id:group.id,track_id:track.id,start_tick:start,end_tick:end,start_anchor_id:null,end_anchor_id:null,condition:{op:'always'},dialogue_ids:[],behavior:'背景闲聊'});}
    items.push({kind:mode==='pool'?'text':'dialogue',name:`${name} · ${mode==='pool'?'环境闲聊':'闲聊'}`,character_id:actorId,scene_id:track.location_id,start_tick:start,end_tick:end,scene_context:{level_id:level.id,track_id:track.id,location_id:track.location_id,appearance_id:appearanceId,group_name:groupName.trim(),mode,start_tick:start,end_tick:end},fields:mode==='pool'?['name','body','text_type','condition','description']:['name','description','character_id','entry_node_id','entry_routes','nodes']});
  }
  if(commands.length)commands.push({type:'put_level',level:next});
  return {items,commands,group};
}
export function sceneScopeMatches(scope,level,track) {
  return scope?.level_id===level.id&&scope.track_id===track.id&&scope.location_id===track.location_id;
}
export function sceneContent(content,level,track,editor) {
  const drafts=content.drafts.filter(d=>sceneScopeMatches(d.scene_context,level,track)&&!isEntryDeleted(editor,{source:'draft',record_id:d.id,item_index:null}));
  const scopedTargets=new Map(content.drafts.filter(d=>d.status==='accepted'&&d.scene_context).map(d=>[d.target.id,d.scene_context]));
  const hasScene=condition=>condition?.op==='scene'?condition.location_id===track.location_id:condition?.op==='all'&&condition.conditions.some(hasScene);
  const texts=content.texts.filter(t=>scopedTargets.has(t.id)?sceneScopeMatches(scopedTargets.get(t.id),level,track):hasScene(t.condition));
  const appearances=level.appearances.filter(a=>a.track_id===track.id);
  const dialogues=appearances.flatMap(appearance=>content.dialogues.filter(g=>(g.character_id===appearance.character_id||!g.character_id)&&(!appearance.dialogue_ids.length||appearance.dialogue_ids.includes(g.id))).map(graph=>({graph,appearance,actor:content.characters.find(a=>a.id===appearance.character_id)})));
  return {texts,dialogues,drafts,pending:drafts.filter(d=>d.status==='pending')};
}
export function draftScopeLabel(draft,content) {
  const scope=draft.scene_context;if(!scope)return '';
  const level=content.levels.find(l=>l.id===scope.level_id),track=level?.tracks.find(t=>t.id===scope.track_id);
  return `${level?.name || '原关卡已移除'} / ${track?.name || '原场景已移除'} · ${scope.start_tick}–${scope.end_tick}`;
}
export function retryGenerationItems(job) {
  return job.items.filter(i=>i.status==='failed').map(({kind,name,target_id,character_id,fields,scene_id,start_tick,end_tick,scene_context,output_limits})=>({kind,name,target_id,character_id,fields,scene_id,start_tick,end_tick,scene_context,...(output_limits?{output_limits:structuredClone(output_limits)}:{})}));
}
