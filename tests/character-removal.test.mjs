import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterRemovalBlockers,characterRemovalCommands,characterDeleteKey} from '../src/characterRemoval.js';
const fixture=()=>({project_id:'p',content:{characters:['a','b','c'].map(id=>({id,kind:'character',name:id})),levels:[],dialogues:[],relations:[],drafts:[],generation_history:[],initial_state:{tick:0,characters:{a:{behavior:'A'},b:{behavior:'B'},c:{behavior:'C'}},variables:{v:1}}},editor:{character_notes:{a:'note'},play_records:[{character_id:'a'}]}});
test('bulk removal deduplicates IDs and clears initial states once, preserving unrelated latest edits and history',()=>{
 const base=fixture(),latest=structuredClone(base);latest.content.initial_state.variables.v=2;latest.content.initial_state.characters.c.behavior='Later';
 const commands=characterRemovalCommands(base,['a','b','a'],latest);
 assert.deepEqual(commands.slice(0,2).map(row=>row.target.id),['a','b']);
 assert.equal(commands.filter(row=>row.type==='set_initial_state').length,1);
 assert.deepEqual(commands[2].state,{tick:0,characters:{c:{behavior:'Later'}},variables:{v:2}});
 assert.equal(base.content.characters.length,3);assert.equal(latest.editor.play_records.length,1);
});
test('one referenced member blocks the whole batch and references are identified per character',()=>{
 const base=fixture();base.content.relations.push({id:'r',label:'Friend',source:{kind:'character',id:'b'},target:{kind:'character',id:'c'}});
 assert.deepEqual(characterRemovalBlockers(base,['a','b']).map(row=>[row.kind,row.characterId]),[['relation','b']]);
 assert.throws(()=>characterRemovalCommands(base,['a','b'],base),/仍被使用/);
 assert.equal(base.content.characters.length,3);
});
test('new reference, profile edit, initial-state edit and missing selected row are rejected at confirmation',()=>{
 const base=fixture();
 for(const mutate of [doc=>doc.content.characters[0].name='Edit',doc=>doc.content.initial_state.characters.a.behavior='Edit',doc=>doc.content.characters.shift(),doc=>doc.content.dialogues.push({id:'d',name:'Dialogue',character_id:'a'})]){
  const latest=structuredClone(base);mutate(latest);assert.throws(()=>characterRemovalCommands(base,['a'],latest));
 }
});
test('history references block deletion while ID text and frozen play snapshots do not',()=>{
 const doc=fixture();doc.content.characters[1].description='a';assert.equal(characterRemovalBlockers(doc,['a']).length,0);
 doc.content.drafts.push({id:'draft',name:'Draft',target:{kind:'character',id:'a'}});
 doc.content.generation_history.push({id:'job',target_refs:[{kind:'character',id:'a'}]});
 assert.deepEqual(characterRemovalBlockers(doc,['a']).map(row=>row.kind),['draft','generation']);
});
test('empty and oversized selections are rejected',()=>{
 const doc=fixture();assert.throws(()=>characterRemovalCommands(doc,[],doc),/选中/);assert.throws(()=>characterRemovalCommands(doc,Array.from({length:500},(_,i)=>`id${i}`),doc),/499/);
});
test('Delete allows checkbox selection but protects text, modified keys, composition and repeats',()=>{
 const event={key:'Delete',target:{closest:()=>null}};assert.equal(characterDeleteKey(event),true);
 assert.equal(characterDeleteKey({...event,target:{closest:()=>({matches:()=>true})}}),true);
 assert.equal(characterDeleteKey({...event,target:{closest:()=>({matches:()=>false})}}),false);
 for(const field of ['defaultPrevented','repeat','isComposing','ctrlKey','metaKey','altKey','shiftKey'])assert.equal(characterDeleteKey({...event,[field]:true}),false);
 assert.equal(characterDeleteKey({...event,key:'Backspace'}),false);
});
