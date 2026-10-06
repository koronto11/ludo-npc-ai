import test from 'node:test';
import assert from 'node:assert/strict';
import {crowdPlan,sceneContent,retryGenerationItems,withSceneOutputLimits} from '../src/sceneGeneration.js';
const level={id:'level',name:'第一关',tracks:[{id:'track',name:'篝火',location_id:'camp'}],appearances:[]};
const content={initial_state:{tick:0},levels:[level],characters:[],dialogues:[],texts:[],drafts:[]};
const settings={mode:'people',count:2,groupName:'居民',roles:'商人、守夜人',tone:'轻松',start:2,end:6};
function plan(extra={}){let n=0;return crowdPlan(content,level,level.tracks[0],{...settings,...extra},prefix=>`${prefix}-${++n}`);}
test('people roster references each individual appearance and preserves the existing level',()=>{
  const before=structuredClone(content),result=plan();
  const next=result.commands.at(-1).level;
  assert.equal(next.appearances.length,2);
  for(const item of result.items){const appearance=next.appearances.find(a=>a.id===item.scene_context.appearance_id);assert.equal(appearance.character_id,item.character_id);assert.equal(appearance.track_id,'track');assert.equal(item.scene_context.group_name,'居民');}
  assert.deepEqual(content,before);
});
test('pool generates scene candidates without characters or appearance mutations',()=>{
  const result=plan({mode:'pool'});assert.deepEqual(result.commands,[]);
  assert.equal(result.items.length,2);assert.ok(result.items.every(i=>i.kind==='text'&&i.character_id===null&&i.scene_context.appearance_id===null));
  assert.throws(()=>plan({start:5,end:4}));assert.throws(()=>plan({count:1.5}));assert.throws(()=>plan({roles:'，、'}));
});
test('shared world locations do not mix new scene batches between levels',()=>{
  const scope=plan({mode:'pool'}).items[0].scene_context;
  const data={...content,texts:[{id:'adopted',condition:{op:'scene',location_id:'camp'}},{id:'manual',condition:{op:'scene',location_id:'camp'}}],drafts:[{id:'d',status:'accepted',target:{id:'adopted'},scene_context:scope},{id:'pending',status:'pending',scene_context:scope}]};
  assert.equal(sceneContent(data,level,level.tracks[0]).texts.length,2);
  assert.equal(sceneContent(data,{...level,id:'other'},level.tracks[0]).texts.length,1);
  assert.equal(sceneContent(data,{...level,id:'other'},level.tracks[0]).pending.length,0);
});
test('same dialogue in multiple visits keeps occurrence-specific navigation',()=>{
  const graph={id:'g',character_id:'actor'},appearances=[{id:'a',character_id:'actor',track_id:'track',dialogue_ids:['g']},{id:'b',character_id:'actor',track_id:'track',dialogue_ids:['g']}];
  const rows=sceneContent({...content,dialogues:[graph]}, {...level,appearances},level.tracks[0]).dialogues;
  assert.deepEqual(rows.map(r=>r.appearance.id),['a','b']);
});
test('retry keeps original scene scope and only resubmits failed items',()=>{
  const item=withSceneOutputLimits(plan().items,2,'short')[0],failed={...item,status:'failed',error:'错误'};
  const retry=retryGenerationItems({items:[failed,{...item,status:'awaiting_review'}]});
  assert.equal(retry.length,1);assert.deepEqual(retry[0].scene_context,item.scene_context);
  assert.equal(retry[0].scene_id,'camp');assert.equal(retry[0].end_tick,6);assert.equal(retry[0].error,undefined);
  assert.deepEqual(retry[0].output_limits,{card_count:2,text_length:'short'});
  retry[0].output_limits.card_count=3;assert.equal(failed.output_limits.card_count,2);
});
test('scene output settings distinguish cards from text and reject invalid scale',()=>{
  const before=plan(),limited=withSceneOutputLimits(before.items,2,'short');
  assert.ok(limited.every(i=>i.output_limits.card_count===2));
  assert.equal(before.items[0].output_limits,undefined);
  const pool=withSceneOutputLimits(plan({mode:'pool'}).items,2,'medium');
  assert.deepEqual(pool[0].output_limits,{card_count:null,text_length:'medium'});
  for(const count of [0,7,2.5,NaN])assert.throws(()=>withSceneOutputLimits(before.items,count,'short'));
  assert.throws(()=>withSceneOutputLimits(before.items,2,'unknown'));
});
