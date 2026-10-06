const collections={location:'locations',faction:'factions'};
export function worldAssetCommands(base,draft,latest) {
  const collection=collections[base.kind];
  if(!collection)throw new Error('不支持的世界资料类型');
  const current=latest.content[collection].find(row=>row.id===base.id);
  if(!current)throw new Error('世界资料已移除，请重新打开。');
  const fields=['name','description','role','tags',...(base.kind==='location'?['parent_id']:['policies'])];
  const changed=fields.filter(key=>JSON.stringify(base[key])!==JSON.stringify(draft[key]));
  if(changed.some(key=>JSON.stringify(base[key])!==JSON.stringify(current[key])))throw new Error('世界资料已被其他页面修改，当前输入已保留。');
  if(!draft.name.trim())throw new Error('名称不能为空');
  if(base.kind==='location'&&draft.parent_id){
    const visited=new Set([base.id]);let id=draft.parent_id;
    while(id){
      if(visited.has(id))throw new Error('所属地点不能形成循环。');
      visited.add(id);const parent=latest.content.locations.find(row=>row.id===id);
      if(!parent)throw new Error('所属地点已移除，请重新选择。');
      id=parent.parent_id;
    }
  }
  return changed.length?[{type:'patch_entity',target:{kind:base.kind,id:base.id},changes:Object.fromEntries(changed.map(key=>[key,draft[key]]))}]:[];
}
