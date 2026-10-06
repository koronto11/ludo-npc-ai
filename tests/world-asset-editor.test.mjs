import test from 'node:test';
import assert from 'node:assert/strict';
import {worldAssetCommands} from '../src/worldAssetEditorModel.js';
const base={kind:'location',id:'camp',name:'Camp',role:'Shelter',description:'Old',tags:[],parent_id:null};
const latest=()=>({content:{locations:[structuredClone(base),{kind:'location',id:'region',parent_id:null}],factions:[]}});
test('location edits are sparse and preserve later unrelated fields and references',()=>{
 const doc=latest();doc.content.locations[0].description='Later';
 assert.deepEqual(worldAssetCommands(base,{...base,name:'New',parent_id:'region'},doc),[{type:'patch_entity',target:{kind:'location',id:'camp'},changes:{name:'New',parent_id:'region'}}]);
 assert.equal(doc.content.locations[0].description,'Later');
 assert.deepEqual(worldAssetCommands(base,base,doc),[]);
});
test('world asset conflicts and missing/cyclic parents refuse edits',()=>{
 const doc=latest();doc.content.locations[0].name='Other';
 assert.throws(()=>worldAssetCommands(base,{...base,name:'Mine'},doc),/其他页面/);
 assert.throws(()=>worldAssetCommands(base,{...base,parent_id:'missing'},doc),/所属地点已移除/);
 assert.throws(()=>worldAssetCommands(base,{...base,parent_id:'camp'},doc),/循环/);
 doc.content.locations[1].parent_id='camp';assert.throws(()=>worldAssetCommands(base,{...base,parent_id:'region'},doc),/循环/);
 doc.content.locations=[];assert.throws(()=>worldAssetCommands(base,base,doc),/已移除/);
});
test('faction policy editing preserves name and unrelated tags',()=>{
 const faction={kind:'faction',id:'guard',name:'Guard',role:'Order',description:'',tags:[],policies:['Old']};
 const doc=latest();doc.content.factions=[{...faction,tags:['Later']}];
 assert.deepEqual(worldAssetCommands(faction,{...faction,policies:['New','Second']},doc),[{type:'patch_entity',target:{kind:'faction',id:'guard'},changes:{policies:['New','Second']}}]);
});
