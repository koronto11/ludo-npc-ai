import {editedLevel} from './moreDetailsModel.js';
import {removeAnchor,removeTrack} from './planning.js';
import {assertGroupMembershipUnchanged} from './appearanceGroups.js';

export function levelCanvasTarget(document,levelId,target) {
  const level=document?.content.levels.find(row=>row.id===levelId);
  if(!level || !target)return null;
  if(target.kind==='event')return document.content.events.find(row=>row.id===target.id&&row.scope?.level_id===levelId) || null;
  const collection={appearance:'appearances',group:'npc_groups',anchors:'anchors',tracks:'tracks'}[target.kind];
  return level[collection]?.find(row=>row.id===target.id) || null;
}

// Existing atomic commands and sparse merges keep deletion local to the selected control.
export function levelCanvasRemovalCommands(base,levelId,target,latest) {
  if(base.project_id!==latest.project_id)throw new Error('所属项目已变化，请重新选择画布组件。');
  const before=levelCanvasTarget(base,levelId,target),current=levelCanvasTarget(latest,levelId,target);
  if(!before || !current)throw new Error('选中的组件已移除，请重新选择。');
  if(JSON.stringify(before)!==JSON.stringify(current))throw new Error('选中的组件已被修改，请重新选择后确认。');
  if(target.kind==='event')return [{type:'delete_entity',target:{kind:'event',id:target.id}}];
  const level=base.content.levels.find(row=>row.id===levelId);
  let next;
  if(target.kind==='appearance')next={...level,appearances:level.appearances.filter(row=>row.id!==target.id)};
  else if(target.kind==='group') {
    assertGroupMembershipUnchanged(level,latest.content.levels.find(row=>row.id===levelId),target.id);
    next={...level,npc_groups:level.npc_groups.filter(row=>row.id!==target.id),appearances:level.appearances.map(row=>row.npc_group_id===target.id?{...row,npc_group_id:null}:row)};
  } else if(target.kind==='anchors')next=removeAnchor(level,target.id);
  else if(target.kind==='tracks')next=removeTrack(level,target.id);
  else throw new Error('请选择画布组件。');
  return [{type:'put_level',level:editedLevel(level,next,latest)}];
}

export function canvasDeleteKey(event) {
  return event.key==='Delete'&&!event.defaultPrevented&&!event.repeat&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey
    &&!event.target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
}
