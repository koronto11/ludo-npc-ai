const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>value===undefined?undefined:structuredClone(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const conflict=()=>{throw new Error('资料已被其他编辑修改，当前输入已保留，请重新打开后核对。');};
export const cleanTags=tags=>(tags || []).map(tag=>tag.trim()).filter(Boolean);

// Three-way merge only authored changes, preserving later unrelated fields and IDs.
export function mergeAuthorChanges(base,draft,current) {
  if(same(base,draft))return copy(current);
  if(same(base,current)||same(draft,current))return copy(draft);
  if(object(base)&&object(draft)&&object(current)) {
    const next=copy(current);
    for(const key of new Set([...Object.keys(base),...Object.keys(draft)])) {
      const value=mergeAuthorChanges(base[key],draft[key],current[key]);
      if(value===undefined)delete next[key];else next[key]=value;
    }
    return next;
  }
  if([base,draft,current].every(Array.isArray)&&[...base,...draft,...current].every(row=>object(row)&&typeof row.id==='string')) {
    const baseMap=new Map(base.map(row=>[row.id,row])),draftMap=new Map(draft.map(row=>[row.id,row])),currentMap=new Map(current.map(row=>[row.id,row]));
    const next=new Map(currentMap);
    for(const [id,row] of baseMap) {
      if(!draftMap.has(id)){if(currentMap.has(id)&&!same(row,currentMap.get(id)))conflict();next.delete(id);}
      else {if(!currentMap.has(id)){if(!same(row,draftMap.get(id)))conflict();continue;}next.set(id,mergeAuthorChanges(row,draftMap.get(id),currentMap.get(id)));}
    }
    for(const [id,row] of draftMap)if(!baseMap.has(id)){if(currentMap.has(id)&&!same(row,currentMap.get(id)))conflict();next.set(id,copy(row));}
    const sharedOrder=rows=>rows.filter(row=>baseMap.has(row.id)&&draftMap.has(row.id)&&currentMap.has(row.id)).map(row=>row.id);
    const reordered=!same(sharedOrder(base),sharedOrder(draft));
    if(reordered&&!same(sharedOrder(base),sharedOrder(current))&&!same(sharedOrder(draft),sharedOrder(current)))conflict();
    const order=[...(reordered?draft:current).map(row=>row.id),...current.map(row=>row.id),...draft.map(row=>row.id)];
    return [...new Set(order)].filter(id=>next.has(id)).map(id=>copy(next.get(id)));
  }
  conflict();
}

const collections={event:'events',rule:'rules',fact:'facts',variable:'variables',dialogue:'dialogues',text:'texts'};
export function authorEntityCommands(base,draft,latest) {
  const rows=latest.content[collections[draft.kind]],current=rows?.find(row=>row.id===draft.id);
  const normalized={...draft,tags:cleanTags(draft.tags)};
  if(!base||base.id!==draft.id){if(current)conflict();return [{type:'create_entity',entity:normalized}];}
  if(!current)throw new Error('资料已移除，请重新打开。');
  const merged=mergeAuthorChanges(base,normalized,current);
  const changes=Object.fromEntries(Object.entries(merged).filter(([key,value])=>!['id','kind'].includes(key)&&!same(value,current[key])));
  return Object.keys(changes).length?[{type:'patch_entity',target:{kind:draft.kind,id:draft.id},changes}]:[];
}
export function editedLevel(base,draft,latest) {
  const current=latest.content.levels.find(level=>level.id===base.id);
  if(!current)throw new Error('关卡已移除，请重新打开。');
  const next={...draft,tags:cleanTags(draft.tags)};
  for(const key of ['anchors','tracks','npc_groups'])next[key]=(draft[key] || []).map(row=>({...row,tags:cleanTags(row.tags)}));
  return mergeAuthorChanges(base,next,current);
}
export function groupSettingsLevel(level,group,settings,bounds) {
  const intervalChanged=settings.start!==bounds.start||settings.end!==bounds.end;
  const trackChanged=settings.track_id!==group.track_id;
  return {...level,npc_groups:level.npc_groups.map(row=>row.id===group.id?{...row,name:settings.name.trim(),description:settings.description,tags:cleanTags(settings.tags),track_id:settings.track_id}:row),appearances:level.appearances.map(row=>row.npc_group_id===group.id?{...row,...(trackChanged?{track_id:settings.track_id}:{}),...(intervalChanged?{start_tick:settings.start,end_tick:settings.end,start_anchor_id:null,end_anchor_id:null}:{})}:row)};
}
export function legacyMetadataCommands(base,draft,latest) {
  const current=latest.content.simulation_cases.find(row=>row.id===base.id);
  if(!current)throw new Error('记录已移除，请重新打开。');
  const metadata={description:draft.description,tags:cleanTags(draft.tags),notes:draft.notes};
  const proposed={...base,...metadata};
  const merged=mergeAuthorChanges(base,proposed,current);
  return same(merged,current)?[]:[{type:'put_simulation_case',case:merged}];
}
