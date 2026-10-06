import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogueEdges, pruneDialogueEdges, routedEdgePath, insertEdgePoint } from '../src/dialogueEdges.js';
const graph={entry_node_id:'start',entry_routes:[{node_id:'next'}],nodes:[{id:'start',options:[{id:'default-entry',target_node_id:'next',condition:{op:'always'}}]},{id:'next',options:[{id:'bye',target_node_id:null,condition:{op:'always'}}]}]};
test('edge identities separate player choices from entry and route connections',()=>{
  const edges=dialogueEdges(graph);
  assert.equal(new Set(edges.map(e=>e.id)).size,4);
  assert.equal(edges.find(e=>e.id==='option:bye').target,'__end');
  assert.equal(edges.find(e=>e.id==='option:default-entry').choiceId,'default-entry');
});
test('deletion removes orphan layouts, reordered entry routes cannot inherit another route marking',()=>{
  const layouts={'option:bye':{color:'#85b59a'},'route:0':{points:[{x:200,y:300}]},'missing':{}};
  const removed={...graph,nodes:[graph.nodes[0]]};
  assert.deepEqual(pruneDialogueEdges(layouts,removed),{'route:0':layouts['route:0']});
  assert.deepEqual(pruneDialogueEdges(layouts,graph,true),{'option:bye':layouts['option:bye']});
});
test('custom paths pass through every author control point and keep both endpoint coordinates',()=>{
  const path=routedEdgePath({x:10,y:20},{x:500,y:40},[{x:250,y:320},{x:390,y:200}]);
  assert.ok(path.startsWith('M 10 20'));
  assert.ok(path.includes(', 250 320'));
  assert.ok(path.includes(', 390 200'));
  assert.ok(path.endsWith(', 500 40'));
  assert.equal(/NaN|Infinity/.test(path),false);
});
test('adding a point near the first segment inserts before existing points',()=>{
  const points=[{x:200,y:200},{x:400,y:200}];
  assert.deepEqual(insertEdgePoint(points,{x:80,y:90},{x:0,y:0},{x:600,y:0}),[{x:80,y:90},...points]);
  assert.equal(points.length,2);
});
