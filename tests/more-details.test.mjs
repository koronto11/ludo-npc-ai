import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeAuthorChanges,editedLevel,authorEntityCommands,groupSettingsLevel,legacyMetadataCommands,cleanTags} from '../src/moreDetailsModel.js';
const clone=structuredClone;
const level={id:'level',name:'Camp',description:'',tags:[],anchors:[{id:'a',name:'Opening',tick:2,tags:[]}],tracks:[{id:'t',name:'Fire',location_id:'fire',tags:[]}],npc_groups:[{id:'g',name:'Residents',description:'',tags:[],track_id:'t'}],appearances:[{id:'one',npc_group_id:'g',track_id:'t',start_tick:2,end_tick:5,start_anchor_id:'a',end_anchor_id:null},{id:'two',npc_group_id:'g',track_id:'t',start_tick:4,end_tick:9,start_anchor_id:null,end_anchor_id:null}]};
test('metadata edits preserve later unrelated level and member changes',()=>{
  const draft=clone(level);draft.tags=[' context ',''];draft.anchors[0].description='Introduction';
  const latest=clone(level);latest.appearances[1].end_tick=12;latest.tracks[0].name='New scene';latest.anchors.push({id:'b',name:'Later',tick:20,tags:[]});
  const result=editedLevel(level,draft,{content:{levels:[latest]}});
  assert.equal(result.appearances[1].end_tick,12);assert.equal(result.tracks[0].name,'New scene');assert.equal(result.anchors[1].id,'b');assert.equal(result.anchors[0].description,'Introduction');assert.deepEqual(result.tags,['context']);
  assert.equal(latest.tags.length,0);
});
test('same field conflicts and removed objects retain original input',()=>{
  const draft=clone(level);draft.anchors[0].name='Authored';const latest=clone(level);latest.anchors[0].name='Concurrent';
  assert.throws(()=>editedLevel(level,draft,{content:{levels:[latest]}}),/其他编辑/);
  latest.anchors=[];assert.throws(()=>editedLevel(level,draft,{content:{levels:[latest]}}),/其他编辑/);
  assert.equal(draft.anchors[0].name,'Authored');
  assert.throws(()=>editedLevel(level,draft,{content:{levels:[]}}),/关卡已移除/);
});
test('group metadata preserves per-member intervals and anchors',()=>{
  const group=level.npc_groups[0],settings={...group,name:' Renamed ',description:'Atmosphere',tags:['NPC'],start:2,end:9};
  const result=groupSettingsLevel(level,group,settings,{start:2,end:9});
  assert.deepEqual(result.appearances,level.appearances);assert.equal(result.npc_groups[0].name,'Renamed');assert.equal(result.npc_groups[0].description,'Atmosphere');
});
test('explicit common interval edits apply to members, scene changes preserve time',()=>{
  const group=level.npc_groups[0],settings={...group,start:2,end:9,track_id:'other'};
  const scene=groupSettingsLevel(level,group,settings,{start:2,end:9});
  assert.equal(scene.appearances[1].start_tick,4);assert.equal(scene.appearances[0].start_anchor_id,'a');assert.ok(scene.appearances.every(row=>row.track_id==='other'));
  const interval=groupSettingsLevel(level,group,{...settings,start:10,end:20},{start:2,end:9});
  assert.ok(interval.appearances.every(row=>row.start_tick===10&&row.end_tick===20&&row.start_anchor_id===null));
});
test('entity tags and text descriptions patch only changed author fields',()=>{
  for(const kind of ['event','rule','fact','variable','dialogue','text']){
    const collections={event:'events',rule:'rules',fact:'facts',variable:'variables',dialogue:'dialogues',text:'texts'};
    const base={kind,id:kind,name:'Original',description:'',tags:[],body:'Keep body'},current={...base,body:'Concurrent body'};
    const commands=authorEntityCommands(base,{...base,tags:['  label ',''],description:'Details'},{content:{[collections[kind]]:[current]}});
    assert.deepEqual(commands[0].changes,{description:'Details',tags:['label']});
    assert.throws(()=>authorEntityCommands(base,{...base,tags:['other']},{content:{[collections[kind]]:[{...current,tags:['new']}]}}),/其他编辑/);
  }
});
test('new author entities cannot overwrite an existing identifier',()=>{
  const row={kind:'text',id:'new',name:'Text',tags:[]};
  assert.equal(authorEntityCommands(null,row,{content:{texts:[]}})[0].type,'create_entity');
  assert.throws(()=>authorEntityCommands(null,row,{content:{texts:[row]}}),/其他编辑/);
});
test('legacy metadata preserves all original or later unrelated path inputs',()=>{
  const base={id:'record',name:'Original',description:'',tags:[],notes:'',seed:17,at_tick:14,location_id:'fire',variable_overrides:{hurt:true},choices:[{id:'click',tick:14,option_id:'aid'}],scene_changes:[{id:'scene',tick:5,location_id:'fire'}]};
  const current={...clone(base),at_tick:20,choices:[...base.choices,{id:'later',tick:20,option_id:'leave'}]};
  const draft={...clone(base),notes:'Reviewed',description:'Test',tags:[' note ',''],seed:99,choices:[]};
  const result=legacyMetadataCommands(base,draft,{content:{simulation_cases:[current]}})[0].case;
  assert.equal(result.seed,17);assert.equal(result.at_tick,20);assert.deepEqual(result.choices,current.choices);assert.deepEqual(result.variable_overrides,base.variable_overrides);assert.deepEqual(result.scene_changes,base.scene_changes);assert.equal(result.notes,'Reviewed');assert.deepEqual(result.tags,['note']);
  assert.throws(()=>legacyMetadataCommands(base,draft,{content:{simulation_cases:[{...current,notes:'Other'}]}}),/其他编辑/);
});
test('stable-ID array edits retain concurrent additions and detect deletion conflicts',()=>{
  const base=[{id:'a',name:'A'},{id:'b',name:'B'}],current=[...base,{id:'c',name:'C'}];
  assert.deepEqual(mergeAuthorChanges(base,[{id:'b',name:'Updated'}],current),[{id:'b',name:'Updated'},{id:'c',name:'C'}]);
  assert.throws(()=>mergeAuthorChanges(base,[base[1]],[{id:'a',name:'Changed'},base[1]]),/其他编辑/);
});
test('author reordering retains external additions and refuses competing reorder',()=>{
  const base=['a','b','c'].map(id=>({id}));
  assert.deepEqual(mergeAuthorChanges(base,[base[2],base[0],base[1]],[...base,{id:'d'}]).map(row=>row.id),['c','a','b','d']);
  assert.throws(()=>mergeAuthorChanges(base,[base[2],base[0],base[1]],[base[1],base[0],base[2]]),/其他编辑/);
});
test('clearing optional descriptions/tags is explicit and source-independent',()=>{
  assert.deepEqual(cleanTags(['one',' ',' two']),['one','two']);
  const base={description:'Original',tags:['Original'],nodes:[{id:'n',text:'Keep'}]};
  assert.deepEqual(mergeAuthorChanges(base,{...base,description:'',tags:[]},base),{description:'',tags:[],nodes:base.nodes});
});
