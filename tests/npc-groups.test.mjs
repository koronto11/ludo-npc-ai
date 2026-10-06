import test from 'node:test';
import assert from 'node:assert/strict';
import {crowdPlan} from '../src/sceneGeneration.js';
import {moveNpcGroup,npcGroupMembers,groupGenerationItems,groupDialogueCommands} from '../src/npcGroups.js';
import {placeAppearance,removeTrack} from '../src/planning.js';

function fixture(){
  const c={initial_state:{tick:0},levels:[{id:'level',anchors:[],tracks:[{id:'fire',name:'篝火',location_id:'camp'},{id:'gate',name:'入口',location_id:'camp'}],appearances:[]}],characters:[],dialogues:[],drafts:[],generation_history:[]};let n=0;
  const result=crowdPlan(c,c.levels[0],c.levels[0].tracks[0],{mode:'people',count:2,groupName:'居民',roles:'商贩、旅客',tone:'自然',start:2,end:8},p=>`${p}-${++n}`);
  c.characters=result.commands.filter(cmd=>cmd.type==='create_entity').map(cmd=>cmd.entity);c.levels=[result.commands.at(-1).level];
  return {content:c,editor:{deleted_generation_entries:[]}};
}
test('creating a group binds each appearance to one persisted group without duplicating profiles',()=>{
  const doc=fixture(),level=doc.content.levels[0];assert.equal(level.npc_groups.length,1);assert.equal(level.appearances.length,2);assert.equal(doc.content.characters.length,2);
  assert.ok(level.appearances.every(a=>a.npc_group_id===level.npc_groups[0].id));
  const items=groupGenerationItems(doc.content,level,level.npc_groups[0]);assert.equal(items.length,2);assert.notEqual(items[0].character_id,items[1].character_id);assert.equal(items[0].scene_context.appearance_id,level.appearances[0].id);
});
test('moving a group preserves individual offsets and duration and leaves nonmembers untouched',()=>{
  const doc=fixture(),level=doc.content.levels[0],before=structuredClone(level);level.appearances[1].start_tick=4;level.appearances.push({...level.appearances[0],id:'free',npc_group_id:null});
  const next=moveNpcGroup(level,level.npc_groups[0].id,3,'gate');assert.deepEqual(next.appearances.map(a=>[a.start_tick,a.end_tick,a.track_id]),[[5,11,'gate'],[7,11,'gate'],[2,8,'fire']]);assert.equal(next.npc_groups[0].track_id,'gate');assert.equal(level.npc_groups[0].track_id,before.npc_groups[0].track_id);
  assert.equal(moveNpcGroup(next,next.npc_groups[0].id,-99,'gate').appearances[0].start_tick,0);
});
test('moving a member to another scene detaches membership; removing a scene preserves characters and appearances',()=>{
  const level=fixture().content.levels[0],next=placeAppearance(level,level.appearances[0],2,8,'gate');assert.equal(next.appearances[0].npc_group_id,null);assert.ok(next.appearances[1].npc_group_id);
  const removed=removeTrack(level,'fire');assert.equal(removed.npc_groups.length,0);assert.equal(removed.appearances.length,2);assert.ok(removed.appearances.every(a=>a.track_id===null&&a.npc_group_id===null));
});
test('member states isolate pending drafts by exact occurrence and hide deleted records',()=>{
  const doc=fixture(),level=doc.content.levels[0],group=level.npc_groups[0],a=level.appearances[0];doc.content.drafts=[{id:'mine',status:'pending',scene_context:{level_id:level.id,appearance_id:a.id},patch:{nodes:[{text:'只属于此人'}]}},{id:'other',status:'pending',scene_context:{level_id:'other',appearance_id:a.id},patch:{}}];
  assert.equal(npcGroupMembers(doc,level,group)[0].status,'待审核');assert.equal(npcGroupMembers(doc,level,group)[1].status,'待写台词');
  doc.editor.deleted_generation_entries=[{source:'draft',record_id:'mine',item_index:null}];assert.equal(npcGroupMembers(doc,level,group)[0].status,'待写台词');
});
test('manual scene dialogue preserves inherited common and own links without linking other actors',()=>{
  const doc=fixture(),level=doc.content.levels[0],a=level.appearances[0];doc.content.dialogues=[{id:'own',character_id:a.character_id},{id:'common',character_id:null},{id:'other',character_id:'another'}];
  const nodes=[{id:'start',text:'风停了',speaker_id:a.character_id,options:[]}],cmd=groupDialogueCommands(doc.content,level,a,null,nodes,()=> 'new');
  assert.deepEqual(cmd[1].level.appearances[0].dialogue_ids,['own','common','new']);assert.deepEqual(cmd[1].level.appearances[1].dialogue_ids,[]);assert.equal(cmd[0].entity.character_id,a.character_id);
  const graph={id:'existing',nodes:[{id:'start',text:'旧文',options:[{id:'choice',text:'走吧',target_node_id:null}],condition:{op:'always'},effects:[]}]};const edited=graph.nodes.map(n=>({...n,text:'新文'}));const patch=groupDialogueCommands(doc.content,level,a,graph,edited,()=> 'unused');assert.deepEqual(patch[0].changes.nodes[0].options,graph.nodes[0].options);assert.deepEqual(Object.keys(patch[0].changes),['nodes']);
});
test('regeneration reviews an update to the existing own dialogue instead of creating another character or graph',()=>{
  const doc=fixture(),level=doc.content.levels[0],a=level.appearances[0];doc.content.dialogues=[{id:'own',character_id:a.character_id,nodes:[],confirmed_fields:['entry_routes']}];
  const items=groupGenerationItems(doc.content,level,level.npc_groups[0]);assert.equal(items[0].target_id,'own');assert.deepEqual(items[0].fields,['entry_node_id','nodes']);assert.equal(items[1].target_id,undefined);
  doc.content.dialogues[0].confirmed_fields.push('nodes');assert.throws(()=>groupGenerationItems(doc.content,level,level.npc_groups[0]),/台词已确认保护/);
});
test('latest regeneration failure remains visible beside old speech; a later success clears the failure',()=>{
  const doc=fixture(),level=doc.content.levels[0],group=level.npc_groups[0],a=level.appearances[0];doc.content.dialogues=[{id:'own',character_id:a.character_id,entry_node_id:'start',nodes:[{id:'start',speaker_id:a.character_id,text:'旧台词'}]}];
  const scope={level_id:level.id,appearance_id:a.id};doc.content.generation_history=[{id:'failed',items:[{status:'failed',scene_context:scope,error:'连接失败'}]}];
  const failed=npcGroupMembers(doc,level,group)[0];assert.equal(failed.status,'生成失败');assert.equal(failed.preview,'旧台词');
  doc.content.generation_history.push({id:'success',items:[{status:'awaiting_review',scene_context:scope}]});assert.equal(npcGroupMembers(doc,level,group)[0].failure,null);
});
