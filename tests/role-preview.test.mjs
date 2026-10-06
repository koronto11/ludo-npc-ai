import test from 'node:test';
import assert from 'node:assert/strict';
import { blockingReasons, shortBlockedReason, previewStatus, canPlay, testSettings, settingsChanged, newTestBranch, validateTestSettings } from '../src/rolePreviewModel.js';
const reason=(passed,text,children=[])=>({passed,reason:text,children});
test('unavailable choices explain the requirement and current value without exposing raw booleans',()=>{
  assert.equal(shortBlockedReason(reason(false,'玩家受伤: 否 = 是')),'需要“玩家受伤”为是（当前为否）');
  const nested=reason(false,'全部条件',[reason(true,'在营地'),reason(false,'全部条件',[reason(false,'玩家受伤: 否 = 是'),reason(false,'信任: 0 ≥ 3')])]);
  assert.equal(blockingReasons(nested).length,2);
  assert.match(shortBlockedReason(nested),/另有 1 项条件/);
});
test('successful OR branches and failed negation are not misreported as failed child requirements',()=>{
  assert.deepEqual(blockingReasons(reason(true,'任一条件',[reason(false,'信任不足'),reason(true,'已认识') ])),[]);
  assert.deepEqual(blockingReasons(reason(false,'条件取反',[reason(true,'玩家受伤: 是 = 是')])),['取反条件未满足']);
});
test('author changes, errors and unfinished replays prevent both starting and choosing',()=>{
  const active={available:true,started:false};
  assert.equal(canPlay(active,{complete:true}),true);
  for(const options of [{complete:false},{complete:true,busy:true},{complete:true,authorDirty:true},{complete:true,error:'失败'},{complete:true,saving:true}]) assert.equal(canPlay(active,options),false);
  assert.equal(canPlay(undefined,{complete:true}),false);
  assert.equal(canPlay({available:false},{complete:true}),false);
});
test('finished dialogues offer restart even though the engine marks their current node unavailable',()=>{
  const active={available:false,closed:true,started:true};
  assert.equal(canPlay(active,{complete:true}),true);
  assert.equal(previewStatus(active,{complete:true}).label,'已结束');
  assert.equal(previewStatus({available:true,started:true}).label,'进行中');
  assert.equal(previewStatus({available:true}).label,'待开始');
  assert.equal(previewStatus(active,{authorDirty:true}).label,'编排未保存');
  assert.equal(previewStatus(active,{complete:false}).label,'预演异常');
});
test('staging test settings does not mutate the branch, current scene may explicitly be empty',()=>{
  const branch={at_tick:14,location_id:'camp',variable_overrides:{injured:false},choices:[{action:'choice'}]};
  const snapshot=structuredClone(branch);
  const current=testSettings(branch,{state:{scene_id:null}});
  assert.equal(current.location_id,null);
  const pending=structuredClone(current);pending.variable_overrides.injured=true;
  assert.equal(settingsChanged(current,pending),true);
  assert.equal(settingsChanged(current,current),false);
  assert.deepEqual(branch,snapshot);
});
test('a fresh test begins once at the requested scene/time, keeps the level and never replays old clicks',()=>{
  const branch={id:'saved',level_id:'level',at_tick:14,location_id:'camp',variable_overrides:{injured:false},choices:[{action:'choice',option_id:'old'}],scene_changes:[{tick:4,location_id:'other'}]};
  const original=structuredClone(branch);
  const settings={at_tick:21,location_id:'clinic',variable_overrides:{injured:true}};
  const next=newTestBranch(branch,settings,'graph','fresh','record');
  assert.equal(next.id,'fresh');assert.equal(next.level_id,'level');assert.equal(next.at_tick,21);assert.equal(next.location_id,'clinic');
  assert.deepEqual(next.scene_changes,[]);
  assert.deepEqual(next.choices,[{tick:21,dialogue_id:'graph',option_id:null,action:'start',sequence:0,record_id:'record'}]);
  next.variable_overrides.injured=false;
  assert.equal(settings.variable_overrides.injured,true);
  assert.deepEqual(branch,original);
});
test('test settings reject empty numeric values and fractional or earlier story times',()=>{
  const c={initial_state:{tick:3},variables:[{id:'trust',name:'信任',value_type:'number'}]};
  assert.equal(validateTestSettings({at_tick:14,variable_overrides:{trust:0}},c),'');
  for(const tick of ['',2,4.5,NaN]) assert.ok(validateTestSettings({at_tick:tick,variable_overrides:{}},c));
  assert.ok(validateTestSettings({at_tick:14,variable_overrides:{trust:''}},c));
});
