import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPlayerState,restartPlay,variableIds,legacyRecord,recordDialogueId,replayRecordInputs,playRecordLists,activeSimulationCases} from '../src/dialoguePlayModel.js';
import {characterPlayRecordLists} from '../src/dialoguePlayModel.js';

test('character records exclude other actors and world paths while retaining own legacy/deleted snapshots',()=>{
 const mine={id:'mine',character_id:'actor',inputs:{card_trial:{dialogue_id:'chat'}}};
 const other={id:'other',character_id:'other',inputs:{card_trial:{dialogue_id:'other-chat'}}};
 const world={id:'world',character_id:null,inputs:{card_trial:null}};
 const doc={editor:{play_records:[mine,other,world],deleted_play_records:[{source:'play_record',record_id:'mine'}]},content:{simulation_cases:[{id:'legacy',choices:[{dialogue_id:'chat'}],variable_overrides:{},at_tick:0}],dialogues:[{id:'chat',character_id:'actor',name:'Chat'}],characters:[{id:'actor',name:'Actor'}],locations:[]}};
 const before=JSON.stringify(doc),lists=characterPlayRecordLists(doc,'actor');
 assert.deepEqual(lists.active.map(r=>r.id),['legacy']);assert.deepEqual(lists.deleted,[mine]);
 assert.equal(playRecordLists(doc).active.length,3);assert.equal(JSON.stringify(doc),before);
});

test('deleted records disappear from active lists, keep snapshots and isolate equal legacy IDs',()=>{
  const snapshot={id:'same',name:'新快照',transcript:[{text:'保留旧对白'}]};
  const legacy={id:'same',name:'旧记录',choices:[],variable_overrides:{},at_tick:0};
  const document={editor:{play_records:[snapshot]},content:{simulation_cases:[legacy],dialogues:[],characters:[],locations:[]}};
  const before=structuredClone(document);
  assert.equal(playRecordLists(document).active.length,2);
  document.editor.deleted_play_records=[{source:'play_record',record_id:'same'}];
  let lists=playRecordLists(document);
  assert.equal(lists.active.length,1);assert.equal(lists.active[0].legacy,true);
  assert.deepEqual(lists.deleted,[snapshot]);
  assert.equal(activeSimulationCases(document).length,1);
  document.editor.deleted_play_records.push({source:'simulation_case',record_id:'same'});
  assert.equal(playRecordLists(document).active.length,0);
  assert.equal(activeSimulationCases(document).length,0);
  document.editor.deleted_play_records=[];
  assert.equal(playRecordLists(document).active.length,2);
  assert.deepEqual(document.editor.play_records,before.editor.play_records);
  assert.deepEqual(document.content,before.content);
});

test('player state is appended at the current point rather than rewriting earlier choices',()=>{
  const inputs={variable_overrides:{injured:false},choices:[],card_trial:{dialogue_id:'chat',started:true,actions:[{type:'choice',option_id:'road'}]}};
  const original=structuredClone(inputs);
  const next=appendPlayerState(inputs,'injured',true);
  assert.equal(next.variable_overrides.injured,false);
  assert.deepEqual(next.card_trial.actions,[{type:'choice',option_id:'road'},{type:'variable',variable_id:'injured',value:true}]);
  assert.deepEqual(inputs,original);
});
test('changing a pre-start state and restarting never carries old clicks or scene changes',()=>{
  const next=appendPlayerState({variable_overrides:{},card_trial:{started:false,actions:[]}},'injured',true);
  assert.equal(next.variable_overrides.injured,true);
  const source={...next,choices:[{option_id:'old'}],scene_changes:[{tick:2}],level_id:'level'};
  const trial=restartPlay(source,'chat',{injured:true},'opening');
  assert.equal(trial.level_id,'level');assert.equal(trial.card_trial.start_node_id,'opening');
  assert.deepEqual(trial.choices,[]);assert.deepEqual(trial.scene_changes,[]);assert.deepEqual(trial.card_trial.actions,[]);
});
test('complex and negated conditions expose variable controls without auto-satisfying the predicate',()=>{
  assert.deepEqual([...variableIds({op:'not',condition:{op:'any',conditions:[{op:'variable',variable_id:'trust'},{op:'variable',variable_id:'hurt'}]}})],['trust','hurt']);
});
test('legacy records stay discoverable without pretending to contain frozen dialogue',()=>{
  const legacy={id:'old',name:'旧测试',at_tick:14,location_id:'fire',choices:[{dialogue_id:'chat',option_id:'ask'}],variable_overrides:{},scene_changes:[]};
  const content={dialogues:[{id:'chat',name:'问候',character_id:'npc'}],characters:[{id:'npc',name:'药师'}],locations:[{id:'fire',name:'篝火'}]};
  const result=legacyRecord(legacy,content);
  assert.equal(result.legacy,true);assert.equal(result.character_name,'药师');assert.equal(recordDialogueId(result),'chat');assert.deepEqual(result.transcript,[]);
  result.inputs.choices.length=0;assert.equal(legacy.choices.length,1);
});
test('retesting a record keeps the chosen player settings but starts at its original card without old choices',()=>{
  const record={dialogue_id:'chat',inputs:{at_tick:14,level_id:'level',variable_overrides:{injured:false},choices:[],scene_changes:[],card_trial:{start_node_id:'opening',use_entry_routes:false,started:true,actions:[{type:'variable',variable_id:'injured',value:true},{type:'choice',option_id:'help'}]}}};
  const original=structuredClone(record);
  const next=replayRecordInputs(record);
  assert.equal(next.variable_overrides.injured,true);assert.equal(next.card_trial.start_node_id,'opening');assert.equal(next.card_trial.use_entry_routes,false);assert.deepEqual(next.card_trial.actions,[]);
  assert.deepEqual(record,original);
});
