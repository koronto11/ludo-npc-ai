import test from 'node:test';
import assert from 'node:assert/strict';
import { directAssociates, visibleRelationshipEntities, visibleRelationshipEdges } from '../src/relationshipView.js';

const project = { entities:[
  {id:'a',kind:'character',name:'夏岚',role:'药师',quickNote:'商会线索',tags:['营地']},
  {id:'b',kind:'character',name:'沈禾',tags:['营地']},
  {id:'c',kind:'character',name:'守卫',tags:['入口']},
  {id:'d',kind:'character',name:'隐藏角色',hidden:true,tags:['营地']},
  {id:'fire',kind:'location',name:'篝火'},
],relations:[{source:'a',target:'b',category:'social'},{source:'b',target:'c',category:'event'},{source:'a',target:'d',category:'social'}],_document:{content:{levels:[{id:'camp',tracks:[{id:'t1',location_id:'fire'}],appearances:[{character_id:'a',track_id:'t1'},{character_id:'c',track_id:null}]}]}}};
const ids = filters => visibleRelationshipEntities(project,filters).map(row=>row.id);

test('highlight includes incoming and outgoing direct relations without transitive expansion',()=>{
  assert.deepEqual([...directAssociates(project.relations,'a')],['a','b','d']);
  assert.deepEqual([...directAssociates(project.relations,'c')],['c','b']);
  assert.deepEqual([...directAssociates(project.relations,'fire')],['fire']);
});
test('filters combine notes, groups, kinds and scene appearances without mutating records',()=>{
  const before = structuredClone(project);
  assert.deepEqual(ids({query:'商会'}),['a']);
  assert.deepEqual(ids({group:'营地'}),['a','b']);
  assert.deepEqual(ids({levelId:'camp',trackId:'t1'}),['a','fire']);
  assert.deepEqual(ids({levelId:'camp',kind:'character'}),['a','c']);
  assert.deepEqual(ids({category:'event'}),['b','c']);
  assert.deepEqual(project,before);
});
test('filtered graph removes orphan lines and respects relationship category',()=>{
  assert.equal(visibleRelationshipEdges(project,visibleRelationshipEntities(project)).length,2);
  assert.equal(visibleRelationshipEdges(project,visibleRelationshipEntities(project,{group:'营地'}),'event').length,0);
});
