import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sceneCast,freshStoryBranch,frozenStoryFrames,savedStoryInputs,hasFutureInputs} from '../src/levelStoryModel.js';
const content={initial_state:{tick:2},characters:[{id:'a',name:'A'},{id:'b',name:'B'}],dialogues:[{id:'d1',character_id:'a'},{id:'d2',character_id:'a'}],levels:[{id:'level',name:'L',tracks:[{id:'scene',location_id:'loc'}],npc_groups:[{id:'group',name:'Residents'}],appearances:[{id:'one',character_id:'a',dialogue_ids:['d1'],track_id:'scene'},{id:'two',character_id:'a',dialogue_ids:[],track_id:'scene'},{id:'background',character_id:'b',dialogue_ids:[],track_id:'scene',npc_group_id:'group'}]}]};
test('scene cast uses server presence gates and deduplicates actors without losing legacy dialogue links',()=>{
 const result={level_id:'level',appearances:[{id:'one',reason:{passed:true}},{id:'two',reason:{passed:true}},{id:'background',reason:{passed:false}}],dialogues:[{id:'d1'},{id:'d2'}]};
 const cast=sceneCast(content,result);assert.equal(cast.people.length,1);assert.deepEqual(cast.people[0].dialogues.map(d=>d.id),['d1','d2']);assert.equal(cast.groups.length,0);
 result.appearances[2].reason.passed=true;assert.equal(sceneCast(content,result).groups[0].members[0].actor.id,'b');
});
test('new story sessions clear old clicks, preserve player settings and clamp the chosen start',()=>{
 const overrides={hurt:true};const branch=freshStoryBranch(content,'level','unknown',0,overrides,()=> 'fresh');
 assert.equal(branch.at_tick,2);assert.equal(branch.location_id,'loc');assert.deepEqual(branch.choices,[]);assert.deepEqual(branch.scene_changes,[]);
 branch.variable_overrides.hurt=false;assert.equal(overrides.hurt,true);
});
test('frozen global records preserve text and discard runtime-only provenance fields',()=>{
 const result={story_flow:[{kind:'state',presentation:'environment',label:'Named text',text:'Immutable prose',tick:5,source_id:'source'},{kind:'npc',speaker:'A',label:'Greeting',text:'Hello',node_id:'node',dialogue_id:'d1',tick:5}]};
 const frozen=frozenStoryFrames(result);assert.equal(frozen[0].label,'环境文本 · Named text');assert.equal(frozen[1].speaker,'A');assert.ok(!('dialogue_id' in frozen[1]));
 result.story_flow[0].text='edited';assert.equal(frozen[0].text,'Immutable prose');
});
test('replay inputs are independent and detect future actions on the unchanged bottom timeline',()=>{
 const branch={at_tick:8,level_id:'level',location_id:'loc',variable_overrides:{},choices:[{tick:12}],scene_changes:[]};
 assert.ok(hasFutureInputs(branch));const saved=savedStoryInputs(branch);saved.choices[0].tick=0;assert.equal(branch.choices[0].tick,12);assert.equal(saved.card_trial,null);
});
test('existing timeline component stays in the same central dock and global cast uses a separate inspector',()=>{
 const app=fs.readFileSync('src/App.jsx','utf8');assert.match(app,/<RuntimeTimeline rehearsal=\{rehearsal\} project=\{project\}/);assert.match(app,/workspace==='情境预演'\?<LevelStoryCast/);
 const source=fs.readFileSync('src/Rehearsal.jsx','utf8');assert.ok(source.includes("['故事时间线', '变化记录', '生成记录', '问题检查']"));
});
