import test from 'node:test';
import assert from 'node:assert/strict';
import {appearanceGroupLevel, assertGroupMembershipUnchanged, groupIntervalSummary, appearanceGroupStyle} from '../src/appearanceGroups.js';
import {editedLevel} from '../src/moreDetailsModel.js';
import {moveNpcGroup} from '../src/npcGroups.js';
import {layoutControls} from '../src/levelControlLayout.js';

function fixture(){return {id:'level',tags:[],tracks:[{id:'gate'},{id:'camp'}],anchors:[{id:'dawn',tick:3}],npc_groups:[],appearances:[
  {id:'a',character_id:'shared',track_id:'gate',start_tick:3,end_tick:8,start_anchor_id:'dawn',end_anchor_id:null,condition:{op:'always'},dialogue_ids:['dialogue-a'],behavior:'巡查'},
  {id:'b',character_id:'shared',track_id:'gate',start_tick:5,end_tick:12,start_anchor_id:null,end_anchor_id:null,condition:{op:'always'},dialogue_ids:[],behavior:'等待'},
  {id:'c',character_id:'other',track_id:'camp',start_tick:1,end_tick:4,dialogue_ids:['dialogue-c']},
]};}
const create = (base,memberIds=['a','b']) => appearanceGroupLevel(base,{id:'g',name:'城门出场',trackId:'gate',memberIds});
test('manual appearance group style stays distinct for background members and later generation',()=>{
  const level=appearanceGroupLevel(fixture(),{id:'appearance-group-stable',name:'人群',trackId:'gate',memberIds:['a','b']});
  const content={characters:[{id:'shared',importance:'background'}],generation_history:[{items:[{scene_context:{mode:'people',level_id:level.id,appearance_id:'a'}}]}]};
  assert.equal(appearanceGroupStyle(content,level,level.npc_groups[0]),'appearance');
  assert.equal(appearanceGroupStyle(content,create(fixture()),{id:'g'}),'npc');
  content.characters[0].importance='key';assert.equal(appearanceGroupStyle(content,create(fixture()),{id:'g'}),'npc');
  content.generation_history=[];assert.equal(appearanceGroupStyle(content,create(fixture()),{id:'g'}),'appearance');
});
test('grouping existing occurrences preserves every field except membership, including repeated profiles and legacy links',()=>{
  const base=fixture(),before=structuredClone(base),next=create(base);
  assert.deepEqual(base,before);assert.equal(next.npc_groups.length,1);
  next.appearances.forEach((a,i)=>{const {npc_group_id,...rest}=a;assert.deepEqual(rest,base.appearances[i]);});
  assert.equal(next.appearances[0].npc_group_id,'g');assert.equal(next.appearances[2].npc_group_id,undefined);
  assert.deepEqual(groupIntervalSummary(next,'g'),{start:3,end:12,mixed:true});
});
test('reject cross-scene, missing, duplicate and already-grouped members',()=>{
  for(const ids of [['a','c'],['a','missing'],['a','a'],['a']])assert.throws(()=>create(fixture(),ids));
  const base=create(fixture());assert.throws(()=>appearanceGroupLevel(base,{id:'other',name:'抢占',trackId:'gate',memberIds:['a','b']}),/其他出场组/);
});
test('member removal, rejoining and dissolution retain times, anchors and dialogue IDs',()=>{
  const base=create(fixture()),one=appearanceGroupLevel(base,{id:'g',name:'城门',trackId:'gate',memberIds:['b']});
  assert.equal(one.appearances[0].npc_group_id,null);assert.deepEqual(one.appearances[0].dialogue_ids,['dialogue-a']);assert.equal(one.appearances[0].start_anchor_id,'dawn');
  const restored=create(one);assert.equal(restored.appearances[0].npc_group_id,'g');
  const dissolved=appearanceGroupLevel(restored,{id:'g',dissolve:true});assert.equal(dissolved.npc_groups.length,0);
  assert.equal(dissolved.appearances.length,3);assert.equal(dissolved.appearances[0].npc_group_id,null);assert.deepEqual(dissolved.appearances[1].dialogue_ids,[]);
});
test('membership conflicts reject new/removed siblings while unrelated edits merge safely',()=>{
  const base=create(fixture()),current=structuredClone(base);current.appearances[0].npc_group_id=null;
  assert.throws(()=>assertGroupMembershipUnchanged(base,current,'g'),/组成员已/);
  const latest=structuredClone(base);latest.appearances[2].behavior='新笔记';assertGroupMembershipUnchanged(base,latest,'g');
  const draft=appearanceGroupLevel(base,{id:'g',name:'新组名',trackId:'gate',memberIds:['a']});
  assert.equal(editedLevel(base,draft,{content:{levels:[latest]}}).appearances[2].behavior,'新笔记');
  latest.appearances[1].npc_group_id='another';assert.throws(()=>editedLevel(base,draft,{content:{levels:[latest]}}));
});
test('group movement retains individual offsets and dissolution preserves shifted intervals',()=>{
  const base=create(fixture()),moved=moveNpcGroup(base,'g',2,'camp');
  assert.deepEqual(moved.appearances.slice(0,2).map(a=>[a.start_tick,a.end_tick,a.track_id]),[[5,10,'camp'],[7,14,'camp']]);
  assert.deepEqual(groupIntervalSummary(moved,'g'),{start:5,end:14,mixed:true});
});
test('measured collapsed group height pulls following controls and scene upward',()=>{
  const controls=[{key:'group:g',height:250},{key:'appearance:c',height:67}];
  const expanded=layoutControls(controls,[],{'group:g':250}),collapsed=layoutControls(controls,[],{'group:g':64});
  assert.ok(collapsed.height<expanded.height);assert.equal(expanded.positions['appearance:c']-collapsed.positions['appearance:c'],186);
});
