import {projectView} from './projectBridge.js';

export const libraryScope = item => item.kind==='level'?'levels':item.kind==='character'?(item.hidden || item.tier==='背景角色'?'residents':'characters'):['location','faction'].includes(item.kind)?'world':item.kind==='event'?'events':['dialogue','text'].includes(item.kind)?'texts':null;

export function orderedLibraryRows(rows, order=[]) {
  const byId=new Map(rows.map(row=>[row.id,row])), seen=new Set(), result=[];
  for(const id of order)if(byId.has(id)&&!seen.has(id)){result.push(byId.get(id));seen.add(id);}
  return [...result,...rows.filter(row=>!seen.has(row.id))];
}

export function librarySiblings(view, scope) {
  const rows=scope==='levels'?(view._document?.content.levels || []):view.entities.filter(item=>libraryScope(item)===scope);
  return orderedLibraryRows(rows,view._document?.editor.library_orders?.[scope]);
}

export function moveLibrarySibling(ids,id,target,after=false) {
  if(id===target)return ids;
  if(!ids.includes(id)||!ids.includes(target))throw new Error('仅能排列同级资料，不能跨分组移动');
  const next=ids.filter(value=>value!==id);
  next.splice(next.indexOf(target)+(after?1:0),0,id);
  return next;
}

export function libraryOrderCommands(base,latest,scope,id,target,after) {
  const before=librarySiblings(projectView(base),scope).map(row=>row.id);
  const current=librarySiblings(projectView(latest),scope).map(row=>row.id);
  const expected=base.editor.library_orders?.[scope] || [];
  if(base.project_id!==latest.project_id||JSON.stringify(expected)!==JSON.stringify(latest.editor.library_orders?.[scope] || [])||JSON.stringify(before)!==JSON.stringify(current))throw new Error('资料排列或分组已变化，请重新排序');
  const order=moveLibrarySibling(before,id,target,after);
  return JSON.stringify(order)===JSON.stringify(before)?[]:[{type:'set_library_order',scope,order,expected_order:expected}];
}
