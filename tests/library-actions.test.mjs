import {test} from 'node:test';
import assert from 'node:assert/strict';
import {libraryDeleteCommands,libraryUsages} from '../src/libraryActionsModel.js';

const fixture=()=>({project_id:'p',content:{characters:[{id:'a',kind:'character',name:'A',story:'loc-id'},{id:'b',kind:'character',name:'B'}],locations:[{id:'loc-id',kind:'location',name:'Place'}],factions:[],events:[],rules:[],dialogues:[],texts:[],relations:[],levels:[{id:'level',name:'Level',tracks:[{id:'track',name:'Scene',location_id:'loc-id'}],appearances:[],npc_groups:[]}],initial_state:{characters:{}},simulation_cases:[],drafts:[],generation_history:[]},editor:{play_records:[]}});

test('usage lookup retains distinct scene visits and ignores prose and frozen snapshots',()=>{
 const doc=fixture();doc.content.levels[0].tracks.push({id:'again',name:'Again',location_id:'loc-id'});doc.editor.play_records.push({inputs:{location_id:'loc-id'}});
 assert.deepEqual(libraryUsages(doc,{kind:'location',id:'loc-id'}).map(r=>r.id),['track','again']);
 assert.equal(libraryUsages(doc,{kind:'character',id:'a'}).length,0);
});
test('nested conditions, effects, explicit dialogue bindings and initial state are dependencies',()=>{
 const doc=fixture();doc.content.dialogues.push({kind:'dialogue',id:'d',name:'Talk',character_id:'b',nodes:[{speaker_id:'a',options:[{condition:{op:'all',conditions:[{op:'location',character_id:'a',location_id:'loc-id'}]},effects:[{op:'behavior',character_id:'a',value:'note'}]}]}]});
 doc.content.levels[0].appearances.push({id:'visit',character_id:'a',track_id:'track',dialogue_ids:['d']});doc.content.initial_state.characters.a={location_id:'loc-id'};
 assert.deepEqual(libraryUsages(doc,{kind:'character',id:'a'}).map(r=>r.kind),['appearance','dialogue','initial']);
 assert.equal(libraryUsages(doc,{kind:'dialogue',id:'d'})[0].kind,'appearance');
 assert.throws(()=>libraryDeleteCommands(doc,{kind:'character',id:'a'},doc),/仍被使用/);
});
test('level deletion refuses scoped rules, followed appearances and saved inputs',()=>{
 const doc=fixture();doc.content.rules.push({id:'r',kind:'rule',name:'Rule',scope:{level_id:'level'}});doc.content.dialogues.push({id:'d',kind:'dialogue',name:'Talk',nodes:[{condition:{op:'appearance',level_id:'level',appearance_id:'visit'}}]});doc.content.simulation_cases.push({id:'c',name:'Saved',level_id:'level'});
 assert.deepEqual(libraryUsages(doc,{kind:'level',id:'level'}).map(r=>r.kind),['rule','dialogue','case']);
 assert.throws(()=>libraryDeleteCommands(doc,{kind:'level',id:'level'},doc),/仍被使用/);
});
test('draft and generation references remain visible even for hidden history entries',()=>{
 const doc=fixture();doc.content.drafts.push({id:'draft',name:'Candidate',target:{kind:'character',id:'a'}});doc.content.generation_history.push({id:'job',name:'Job',target_refs:[{kind:'character',id:'a'}]});
 assert.deepEqual(libraryUsages(doc,{kind:'character',id:'a'}).map(r=>r.kind),['draft','generation']);
});
test('deletion rechecks current data, preserves unrelated edits and produces only the requested command',()=>{
 const base=fixture(),latest=structuredClone(base),target={kind:'character',id:'a'};latest.content.characters[1].name='Later';
 assert.deepEqual(libraryDeleteCommands(base,target,latest),[{type:'delete_entity',target}]);
 assert.deepEqual(libraryDeleteCommands(base,{kind:'level',id:'level'},latest),[{type:'delete_level',level_id:'level'}]);
 latest.content.characters[0].name='Changed';assert.throws(()=>libraryDeleteCommands(base,target,latest),/已被修改/);
 assert.throws(()=>libraryDeleteCommands(base,target,{...base,project_id:'other'}),/所属项目/);
 latest.content.characters=[];assert.throws(()=>libraryDeleteCommands(base,target,latest),/已移除/);
 assert.equal(base.content.characters.length,2);
});
test('character deletion explicitly clears only its own initial state and refuses new state edits',()=>{
 const base=fixture();base.content.initial_state.characters.a={behavior:'Ready'};
 const latest=structuredClone(base);latest.content.initial_state.characters.b={behavior:'Later'};
 const commands=libraryDeleteCommands(base,{kind:'character',id:'a'},latest);
 assert.equal(commands[0].type,'delete_entity');assert.deepEqual(commands[1].state.characters,{b:{behavior:'Later'}});
 assert.equal(base.content.initial_state.characters.a.behavior,'Ready');
 latest.content.initial_state.characters.a.behavior='Changed';assert.throws(()=>libraryDeleteCommands(base,{kind:'character',id:'a'},latest),/已被修改/);
});
