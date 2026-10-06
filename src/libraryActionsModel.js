const collections={character:'characters',location:'locations',faction:'factions',event:'events',rule:'rules',dialogue:'dialogues',text:'texts',level:'levels'};
const referenceFields={character:['character_id','speaker_id','author_id','affected_character_ids'],location:['location_id','parent_id'],event:['event_id'],dialogue:['dialogue_id','dialogue_ids'],text:['text_id'],level:['level_id']};

export function libraryObject(document,target) {
  return document?.content[collections[target.kind]]?.find(row=>row.id===target.id);
}

// Only typed reference fields count, never prose or coincidentally matching names.
function references(value,target) {
  if(!value || typeof value!=='object')return false;
  if(Array.isArray(value))return value.some(row=>references(row,target));
  if(value.kind===target.kind && value.id===target.id)return true;
  const fields=referenceFields[target.kind] || [];
  return Object.entries(value).some(([key,row])=>(fields.includes(key) && (row===target.id || Array.isArray(row)&&row.includes(target.id))) || references(row,target));
}

export function libraryUsages(document,target) {
  const c=document.content, result=[];
  const add=row=>result.push(row);
  for(const level of c.levels || []) {
    if(target.kind==='level'&&level.id===target.id)continue;
    for(const track of level.tracks || [])if(references(track,target))add({kind:'track',id:track.id,levelId:level.id,trackId:track.id,name:`${level.name} / ${track.name}`});
    for(const appearance of level.appearances || [])if(references(appearance,target)) {
      const actor=c.characters.find(row=>row.id===appearance.character_id),track=level.tracks.find(row=>row.id===appearance.track_id);
      add({kind:'appearance',id:appearance.id,levelId:level.id,trackId:appearance.track_id,actorId:appearance.character_id,name:`${level.name} / ${track?.name || '—'} / ${actor?.name || appearance.character_id}`});
    }
  }
  for(const [kind,collection] of Object.entries(collections)) {
    if(kind==='level')continue;
    for(const row of c[collection] || [])if(!(kind===target.kind&&row.id===target.id)&&references(row,target))add({kind,id:row.id,name:row.name});
  }
  for(const row of c.relations || [])if(references(row,target))add({kind:'relation',id:row.id,actorId:[row.source,row.target].find(ref=>ref.kind==='character')?.id,name:row.label || row.description || row.id});
  const initial=c.initial_state || {};
  if(target.kind==='character' && Object.hasOwn(initial.characters || {},target.id) || references(initial,target))add({kind:'initial',id:'initial',name:'初始状态'});
  for(const row of c.simulation_cases || [])if(references(row,target))add({kind:'case',id:row.id,name:row.name});
  // These records are retained by backend integrity rules even when hidden in an inbox.
  for(const row of c.drafts || [])if(references(row,target))add({kind:'draft',id:row.id,name:row.name});
  for(const row of c.generation_history || [])if(references(row,target))add({kind:'generation',id:row.id,name:row.name || row.request_id || row.id});
  return result;
}

export function libraryDeleteCommands(base,target,latest) {
  const before=libraryObject(base,target), current=libraryObject(latest,target);
  if(base.project_id!==latest.project_id || !before || !current)throw new Error('资料已移除或所属项目已变化，请重新打开菜单。');
  if(JSON.stringify(before)!==JSON.stringify(current))throw new Error('资料已被修改，请核对最新内容后重新确认删除。');
  if(libraryDeleteBlockers(latest,target).length)throw new Error('这份资料仍被使用，请先处理列出的关联。');
  const commands=[target.kind==='level'?{type:'delete_level',level_id:target.id}:{type:'delete_entity',target:{kind:target.kind,id:target.id}}];
  if(target.kind==='character') {
    const beforeState=base.content.initial_state?.characters?.[target.id],currentState=latest.content.initial_state?.characters?.[target.id];
    if(JSON.stringify(beforeState)!==JSON.stringify(currentState))throw new Error('资料已被修改，请核对最新内容后重新确认删除。');
    if(currentState!==undefined){const characters={...latest.content.initial_state.characters};delete characters[target.id];commands.push({type:'set_initial_state',state:{...latest.content.initial_state,characters}});}
  }
  return commands;
}

export const libraryDeleteBlockers=(document,target)=>libraryUsages(document,target).filter(row=>!(target.kind==='character'&&row.kind==='initial'));
