import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewEntries,filterReviewEntries,deletionCommand,generationOverview} from '../src/draftReviewModel.js';
import {sceneContent,retryGenerationItems} from '../src/sceneGeneration.js';
const document=()=>({editor:{deleted_generation_entries:[]},content:{drafts:[{id:'same',task_id:'job',status:'pending',name:'第一份 · 候选草稿',target:{kind:'text'},patch:{body:'第一段文本'},scene_context:{level_id:'l',track_id:'t',location_id:'s'}}],generation_history:[{id:'job',model:'test',status:'failed',items:[{name:'第二份',status:'failed',error:'网络失败',kind:'text'},{name:'第三份',status:'draft',kind:'text'}]}],texts:[],dialogues:[]}});
test('inbox distinguishes independent drafts and failed items; successful requests are not failures',()=>{
  const entries=reviewEntries(document());assert.equal(entries.length,2);assert.equal(entries[0].name,'第一份');assert.equal(entries[1].item_index,0);assert.equal(entries[1].preview,'网络失败');
  assert.equal(filterReviewEntries(entries).length,1);assert.equal(filterReviewEntries(entries,{status:'failed'}).length,1);
  assert.deepEqual(retryGenerationItems({...entries[1].job,items:[entries[1].item]}).map(i=>i.name),['第二份']);
});
test('recoverable deletion isolates source and index and excludes deleted pending drafts',()=>{
  const doc=document();doc.editor.deleted_generation_entries=[{source:'draft',record_id:'same',item_index:null}];
  let entries=reviewEntries(doc);assert.equal(filterReviewEntries(entries).length,0);assert.equal(filterReviewEntries(entries,{status:'failed'}).length,1);assert.equal(filterReviewEntries(entries,{status:'deleted'}).length,1);
  assert.deepEqual(deletionCommand(entries[0],false),{type:'set_generation_entry_deleted',source:'draft',record_id:'same',item_index:null,deleted:false});
  const level={id:'l',appearances:[]},track={id:'t',location_id:'s'};assert.equal(sceneContent(doc.content,level,track,doc.editor).pending.length,0);
  doc.editor.deleted_generation_entries=[];assert.equal(sceneContent(doc.content,level,track,doc.editor).pending.length,1);
});
test('status counts respect batch scope and text search',()=>{
  const entries=reviewEntries(document());assert.equal(filterReviewEntries(entries,{scope:'other'}).length,0);assert.equal(filterReviewEntries(entries,{query:'第一段'}).length,1);assert.equal(filterReviewEntries(entries,{query:'不存在'}).length,0);
});
test('legacy failed jobs remain visible and live progress replaces persisted snapshots',()=>{
  const doc=document();doc.content.generation_history=[{id:'old',name:'旧记录',status:'failed',failures:['接口错误'],items:[]}];
  const legacy=reviewEntries(doc).find(e=>e.source==='failed_item');assert.equal(legacy.item_index,0);assert.equal(legacy.preview,'接口错误');
  const current=reviewEntries(document(),[{id:'job',status:'completed',items:[{name:'已重试',status:'draft'}]}]);assert.equal(current.filter(e=>e.status==='failed').length,0);
});


test('generation overview merges live batches and honors deleted inbox records',()=>{
  const doc=document();
  doc.content.generation_history.push({id:'active',name:'旧进度',status:'running',items:[]});
  let overview=generationOverview(doc,[{id:'active',name:'最新进度',status:'queued'},{id:'new',status:'running'}]);
  assert.equal(overview.records,3);assert.equal(overview.active.length,2);
  assert.equal(overview.active.find(j=>j.id==='active').name,'最新进度');
  assert.equal(overview.pending,1);assert.equal(overview.failed,1);
  doc.editor.deleted_generation_entries=[{source:'draft',record_id:'same',item_index:null},{source:'failed_item',record_id:'job',item_index:0}];
  overview=generationOverview(doc,[{id:'active',status:'completed'}]);
  assert.equal(overview.active.length,0);assert.equal(overview.pending,0);assert.equal(overview.failed,0);
});
