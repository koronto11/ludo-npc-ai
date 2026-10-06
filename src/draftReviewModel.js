import {localizeLabels} from './i18n.js';
export const reviewStates=localizeLabels({pending:'待审核',accepted:'已采用',rejected:'已拒绝',failed:'生成失败',deleted:'已删除'});
export const entryKey=entry=>`${entry.source}:${entry.record_id}:${entry.item_index ?? ''}`;
export function isEntryDeleted(editor,entry){return (editor?.deleted_generation_entries || []).some(row=>entryKey(row)===entryKey(entry));}
export function reviewEntries(document,jobs=[]){
  const content=document.content, records=new Map(content.generation_history.map(job=>[job.id,job]));
  for(const job of jobs)records.set(job.id,{...records.get(job.id),...job});
  const drafts=content.drafts.map(draft=>({source:'draft',record_id:draft.id,item_index:null,name:draft.name.replace(/ · 候选草稿$/u,''),status:draft.status,draft,task_id:draft.task_id,scene_context:draft.scene_context,model:draft.model,preview:draftPreview(draft)}));
  const failures=[...records.values()].flatMap(job=>{
    const items=(job.items || []).flatMap((item,index)=>item.status==='failed'?[{source:'failed_item',record_id:job.id,item_index:index,name:item.name,status:'failed',task_id:job.id,scene_context:item.scene_context,model:job.model,preview:item.error || '生成未完成',job,item}]:[]);
    if(!job.items?.length&&['failed','interrupted','cancelled'].includes(job.status))items.push({source:'failed_item',record_id:job.id,item_index:0,name:job.name,status:'failed',task_id:job.id,model:job.model,preview:job.failures?.join('\n') || job.detail || '任务未完成',job});
    return items;
  });
  return [...drafts,...failures].map(entry=>({...entry,key:entryKey(entry),deleted:isEntryDeleted(document.editor,entry)}));
}
export function draftPreview(draft){
  const patch=draft.patch;
  return patch.body || patch.story || patch.description || patch.nodes?.find(node=>node.text)?.text || patch.role || '点击卡片查看内容与审核详情';
}
export function filterReviewEntries(entries,{scope='',status='pending',query=''}={}){
  return entries.filter(entry=>(!scope||entry.task_id===scope)&&(status==='deleted'?entry.deleted:!entry.deleted&&entry.status===status)&&`${entry.name} ${entry.preview} ${entry.model}`.toLowerCase().includes(query.trim().toLowerCase()));
}
export function deletionCommand(entry,deleted){return {type:'set_generation_entry_deleted',source:entry.source,record_id:entry.record_id,item_index:entry.item_index,deleted};}

export function generationOverview(document,jobs=[]){
  if(!document)return {active:[],pending:0,failed:0,records:0};
  const records=new Map(document.content.generation_history.map(job=>[job.id,job]));
  for(const job of jobs)records.set(job.id,{...records.get(job.id),...job});
  const entries=reviewEntries(document,jobs).filter(entry=>!entry.deleted);
  return {active:[...records.values()].filter(job=>['queued','running'].includes(job.status)),
    pending:entries.filter(entry=>entry.status==='pending').length,
    failed:entries.filter(entry=>entry.status==='failed').length,records:records.size};
}
