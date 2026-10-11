import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasDeleteKey,levelCanvasRemovalCommands,levelCanvasTarget} from '../src/levelCanvasRemoval.js';

const fixture=()=>({project_id:'project',content:{levels:[{id:'level',name:'关卡',tags:[],anchors:[{id:'anchor',tick:3}],tracks:[{id:'track',name:'城门'}],npc_groups:[{id:'group',track_id:'track',name:'守军'}],appearances:[
  {id:'first',character_id:'actor',track_id:'track',npc_group_id:'group',start_tick:3,end_tick:8,start_anchor_id:'anchor',dialogue_ids:['chat'],behavior:'守门'},
  {id:'second',character_id:'actor2',track_id:'track',npc_group_id:'group',start_tick:5,end_tick:9,dialogue_ids:[]},
  {id:'third',character_id:'actor',track_id:'track',npc_group_id:null,start_tick:3,end_tick:8,dialogue_ids:['chat']},
]}],events:[{id:'event',kind:'event',name:'换岗',scope:{level_id:'level',track_id:'track'},effects:[]}],characters:[{id:'actor'}],dialogues:[{id:'chat'}]}});
const remove=(base,target,latest=base)=>levelCanvasRemovalCommands(base,'level',target,latest);

test('identical component IDs in another project cannot authorize removal',()=>{
  const base=fixture(),latest={...structuredClone(base),project_id:'other-project'};
  for(const target of [{kind:'appearance',id:'first'},{kind:'group',id:'group'},{kind:'event',id:'event'},{kind:'anchors',id:'anchor'},{kind:'tracks',id:'track'}])assert.throws(()=>remove(base,target,latest),/所属项目/);
});

test('appearance removal is scoped and sparse, preserving profiles, dialogue and later unrelated edits',()=>{
  const base=fixture(),latest=structuredClone(base);latest.content.levels[0].name='新名称';latest.content.levels[0].appearances[1].behavior='后来调整';
  const next=remove(base,{kind:'appearance',id:'first'},latest)[0].level;
  assert.deepEqual(next.appearances.map(row=>row.id),['second','third']);
  assert.equal(next.appearances[0].behavior,'后来调整');assert.equal(next.name,'新名称');
  assert.equal(base.content.characters.length,1);assert.equal(base.content.dialogues.length,1);assert.equal(base.content.levels[0].appearances.length,3);
});

test('group deletion dissolves only that group and retains member intervals, anchors and dialogue',()=>{
  const base=fixture(),next=remove(base,{kind:'group',id:'group'})[0].level;
  assert.equal(next.npc_groups.length,0);
  assert.deepEqual(next.appearances,base.content.levels[0].appearances.map(row=>({...row,npc_group_id:null})));
});

test('new group memberships and changes to selected controls reject stale removal',()=>{
  const base=fixture(),latest=structuredClone(base);latest.content.levels[0].appearances[2].npc_group_id='group';
  assert.throws(()=>remove(base,{kind:'group',id:'group'},latest),/组成员/);
  latest.content.levels[0].appearances[0].behavior='已改';
  assert.throws(()=>remove(base,{kind:'appearance',id:'first'},latest),/已被修改/);
  latest.content.events[0].name='新事件名';assert.throws(()=>remove(base,{kind:'event',id:'event'},latest),/已被修改/);
});

test('axis removal retains times and unassigns scene appearances through existing contracts',()=>{
  const base=fixture(),anchor=remove(base,{kind:'anchors',id:'anchor'})[0].level,track=remove(base,{kind:'tracks',id:'track'})[0].level;
  assert.equal(anchor.anchors.length,0);assert.equal(anchor.appearances[0].start_anchor_id,null);assert.equal(anchor.appearances[0].start_tick,3);
  assert.equal(track.tracks.length,0);assert.equal(track.npc_groups.length,0);assert.ok(track.appearances.every(row=>row.track_id===null));
});

test('events use entity deletion with valid level ownership; absent or unsupported targets do not mutate',()=>{
  const base=fixture();assert.deepEqual(remove(base,{kind:'event',id:'event'}),[{type:'delete_entity',target:{kind:'event',id:'event'}}]);
  assert.equal(levelCanvasTarget(base,'other',{kind:'event',id:'event'}),null);
  assert.throws(()=>remove(base,{kind:'group',id:'gone'}),/已移除/);
  assert.throws(()=>remove(base,{kind:'unknown',id:'first'}),/已移除/);
});

test('Delete shortcut ignores text editing, modifiers, composition, repeated and handled keys',()=>{
  const key={key:'Delete',target:{closest:()=>null}};assert.equal(canvasDeleteKey(key),true);
  for(const field of ['repeat','isComposing','ctrlKey','metaKey','altKey','shiftKey','defaultPrevented'])assert.equal(canvasDeleteKey({...key,[field]:true}),false);
  assert.equal(canvasDeleteKey({...key,key:'Backspace'}),false);
  assert.equal(canvasDeleteKey({...key,target:{closest:()=>({})}}),false);
});
