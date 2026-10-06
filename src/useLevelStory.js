import { useEffect,useRef,useState } from 'react';
import { t } from './i18n';
import { sceneCast,freshStoryBranch,frozenStoryFrames,savedStoryInputs,hasFutureInputs } from './levelStoryModel';

export function useLevelStory(local,r,enabled,preferredLevel,announce){
  const [dialogueId,setDialogueId]=useState('');
  const [panel,setPanel]=useState('');
  const [pending,setPending]=useState(null);
  const [saving,setSaving]=useState(false);
  const savingRef=useRef(false);
  const savedKey=useRef('');
  const savedRecordId=useRef('');
  const content=r.document?.content;
  useEffect(()=>{setDialogueId('');setPanel('');setPending(null);savedKey.current='';savedRecordId.current='';},[r.document?.project_id,r.branch?.id]);
  useEffect(()=>{
    if(!enabled||!content||!r.branch||r.busy||r.branch.level_id||r.dirty||!content.levels.length)return;
    const level=content.levels.find(l=>l.id===preferredLevel) || content.levels[0];
    r.replaceStory(freshStoryBranch(content,level.id,r.branch.location_id,r.branch.at_tick,r.branch.variable_overrides));
  },[enabled,r.document?.project_id,content?.levels.length,r.branch?.id,r.branch?.level_id,r.busy,r.dirty,preferredLevel]);
  const cast=content?sceneCast(content,r.result):{people:[],groups:[],level:null};
  const active=r.result?.dialogues.find(d=>d.id===dialogueId);
  const locked=r.busy||saving||!r.result?.complete||r.result?.content_revision!==r.document?.content_revision||!!r.error||!!r.result?.diagnostics.length;
  const inputKey=r.branch?JSON.stringify([r.document?.content_revision,savedStoryInputs(r.branch)]):'';
  const frames=frozenStoryFrames(r.result || {});
  const saved=savedKey.current===inputKey&&!r.document?.editor.deleted_play_records.some(row=>row.source==='play_record'&&row.record_id===savedRecordId.current);
  const saveable=!locked&&!!frames.length&&frames.length<=384&&!saved;
  const start=row=>{
    if(locked||hasFutureInputs(r.branch))return;
    setDialogueId(row.id);
    if(row.closed)r.record(row.id,null,'restart');
    else if(!row.started&&row.available)r.record(row.id,null,'start');
  };
  const switchScene=location=>{if(!r.scene(location))return;setDialogueId('');};
  const requestScene=location=>{
    if(active?.started&&!active.closed){setPending({type:'scene',location});return;}
    switchScene(location);
  };
  const requestRestart=settings=>{
    const next=settings || {levelId:r.branch.level_id,locationId:r.branch.location_id,tick:content.initial_state.tick,variables:r.branch.variable_overrides};
    const run=()=>{r.replaceStory(freshStoryBranch(content,next.levelId,next.locationId,next.tick,next.variables));setPanel('');setPending(null);};
    if(r.dirty)setPending({type:'restart',run});
    else run();
  };
  const saveRecord=async(name=`${cast.level?.name || t('关卡试玩')} · ${new Date().toLocaleTimeString()}`)=>{
    if(savingRef.current||!saveable)return false;
    savingRef.current=true;setSaving(true);
    const key=inputKey;
    const record={id:`play-${crypto.randomUUID()}`,name:name.trim().slice(0,150),created_at:new Date().toISOString(),content_revision:r.result.content_revision,character_id:null,dialogue_id:null,character_name:cast.level?.name || '',dialogue_name:t('关卡试玩'),scene_name:content.locations.find(l=>l.id===r.result.state.scene_id)?.name || '',initial_variables:structuredClone(r.result.starting_variables),variable_labels:Object.fromEntries(content.variables.map(v=>[v.id,v.name])),inputs:savedStoryInputs(r.branch),transcript:frames};
    try {await local.transact([{type:'save_play_record',record}]);savedKey.current=key;savedRecordId.current=record.id;r.acceptSavedStory(r.branch);announce(t('关卡试玩已保存，包含对白与环境记录'));return record;}
    catch(e){announce(e.message);return false;}
    finally{savingRef.current=false;setSaving(false);}
  };
  const deleteRecord=async(record,deleted)=>{
    if(savingRef.current)return false;
    savingRef.current=true;setSaving(true);
    try{await local.transact([{type:'set_play_record_deleted',source:record.legacy?'simulation_case':'play_record',record_id:record.id,deleted}]);announce(t(deleted?'已删除记录，可在已删除列表恢复':'记录已恢复。'));return true;}
    catch(e){announce(e.message);return false;}
    finally{savingRef.current=false;setSaving(false);}
  };
  const replay=record=>{
    const inputs=record.inputs;
    if(inputs.card_trial){announce(t('角色卡片记录请在角色工作台重试'));return;}
    if(inputs.level_id&&!content.levels.some(l=>l.id===inputs.level_id)){announce(t('原关卡已移除，仍可查看历史文字'));return;}
    const run=()=>{r.replaceStory({...freshStoryBranch(content,inputs.level_id,inputs.location_id,inputs.at_tick,inputs.variable_overrides),...structuredClone(inputs),id:`branch-${crypto.randomUUID()}`,name:record.name});setPanel('');setDialogueId('');setPending(null);};
    if(r.dirty)setPending({type:'restart',run});else run();
  };
  return {r,cast,active,dialogueId,panel,setPanel,pending,setPending,saving,locked,resetLocked:r.busy||saving,saveable,saved,frames,start,clearDialogue:()=>setDialogueId(''),choose:option=>r.record(dialogueId,option),requestScene,requestRestart,saveRecord,deleteRecord,replay,confirmPending:()=>{if(pending?.type==='scene')switchScene(pending.location);else pending?.run();setPending(null);}};
}
