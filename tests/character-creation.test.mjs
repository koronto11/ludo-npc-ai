import test from 'node:test';
import assert from 'node:assert/strict';
import {characterCreationCommands} from '../src/characterCreation.js';

const doc=()=>({content:{characters:[],levels:[{id:'level',appearances:[]}]},editor:{canvases:[{id:'board',name:'原画布',nodes:[{entity:{kind:'location',id:'gate'},position:{x:500,y:30},visible:true}],edges:[{relation_id:'rel',source_handle:'left',target_handle:'right'}]}]}});
const draft={name:'  仆役  ',role:'物资看守',importance:'supporting',description:'守着缺页名册。'};
test('character creation preserves the board and keeps profile, scene and dialogue responsibilities separate',()=>{
 const before=doc(),copy=structuredClone(before),commands=characterCreationCommands(before,draft,'npc');
 assert.deepEqual(before,copy);
 assert.deepEqual(commands[0],{type:'create_entity',entity:{kind:'character',id:'npc',name:'仆役',role:'物资看守',importance:'supporting',description:'守着缺页名册。'}});
 assert.deepEqual(commands[1].canvas.edges,before.editor.canvases[0].edges);
 assert.deepEqual(commands[1].canvas.nodes[0],before.editor.canvases[0].nodes[0]);
 assert.equal(commands[1].canvas.nodes[1].position.x,810);
 assert.equal(commands.some(row=>row.type==='put_level'||row.entity?.kind==='dialogue'),false);
});
test('retrying a committed creation cannot duplicate or silently overwrite the profile',()=>{
 const before=doc();before.content.characters=[characterCreationCommands(before,draft,'npc')[0].entity];
 assert.deepEqual(characterCreationCommands(before,draft,'npc'),[]);
 assert.throws(()=>characterCreationCommands(before,{...draft,description:'修改后'},'npc'),/已创建/);
 assert.throws(()=>characterCreationCommands(doc(),{...draft,name:'  '},'npc'),/不能为空/);
});
