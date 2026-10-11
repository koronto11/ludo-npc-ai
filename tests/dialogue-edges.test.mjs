import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogueEdges, pruneDialogueEdges, routedEdgePath, insertEdgePoint, retargetDialogueEdge, removeDialogueEdge, dialogueConnectionEdgeId } from '../src/dialogueEdges.js';
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

test('retargeting preserves choice identity, text, conditions and effects, supports NPC ending and legacy direct exit',()=>{
  const choice={id:'choice',text:'谢谢你',condition:{op:'eq',variable_id:'flag',value:true},effects:[{op:'set',variable_id:'flag',value:false}],target_node_id:'next'};
  const g={...graph,nodes:[{id:'start',options:[choice]},{id:'next',options:[]},{id:'closing',node_type:'ending',text:'路上小心',options:[]}]};
  const patch=retargetDialogueEdge(g,'option:choice','closing');
  assert.deepEqual(patch.nodes[0].options[0],{...choice,target_node_id:'closing'});
  assert.equal(patch.nodes[1],g.nodes[1]);assert.equal(g.nodes[0].options[0],choice);
  const next={...g,...patch};
  assert.equal(dialogueEdges(next).find(row=>row.choiceId==='choice').target,'closing');
  assert.equal(retargetDialogueEdge(next,'option:choice','__end').nodes[0].options[0].target_node_id,null);
  assert.equal(retargetDialogueEdge(next,'option:choice','closing'),null);
});

test('retargeting conditional or default entries preserves rule order and rejects implicit direct exit or unknown nodes',()=>{
  const condition={op:'always'},g={...graph,entry_routes:[{node_id:'next',condition}]};
  assert.deepEqual(retargetDialogueEdge(g,'route:0','start'),{entry_routes:[{node_id:'start',condition}]});
  assert.deepEqual(retargetDialogueEdge(g,'entry:default','next'),{entry_node_id:'next'});
  for(const id of ['route:0','entry:default'])assert.equal(retargetDialogueEdge(g,id,'__end'),null);
  assert.equal(retargetDialogueEdge(g,'option:bye','missing'),null);
  assert.equal(retargetDialogueEdge(g,'missing','start'),null);
});

test('deleting an option edge removes only its choice and retains destination cards and unrelated choices',()=>{
  const patch=removeDialogueEdge(graph,'option:default-entry');
  assert.equal(patch.nodes.length,2);assert.deepEqual(patch.nodes[0].options,[]);
  assert.equal(patch.nodes[1],graph.nodes[1]);assert.equal(graph.nodes[0].options.length,1);
  const merged={...graph,...patch};
  assert.equal(dialogueEdges(merged).some(row=>row.id==='option:default-entry'),false);
  assert.equal(dialogueEdges(merged).some(row=>row.id==='option:bye'),true);
});

test('conditional edge deletion removes that entry only; default entry remains mandatory',()=>{
  const g={...graph,entry_routes:[{node_id:'start',condition:{op:'always'}},{node_id:'next',condition:{op:'always'}}]};
  assert.deepEqual(removeDialogueEdge(g,'route:0'),{entry_routes:[g.entry_routes[1]]});
  assert.equal(removeDialogueEdge(g,'entry:default'),null);
  assert.equal(removeDialogueEdge(g,'option:missing'),null);
});

test('connection validation rejects absent ports and entry destinations while accepting direct and NPC endings',()=>{
  const g={...graph,nodes:[...graph.nodes,{id:'closing',node_type:'ending',options:[]}]};
  const choice={source:'start',sourceHandle:'default-entry',target:'closing'};
  assert.equal(dialogueConnectionEdgeId(g,choice),'option:default-entry');
  assert.equal(dialogueConnectionEdgeId(g,{...choice,target:'__end'}),'option:default-entry');
  assert.equal(dialogueConnectionEdgeId(g,{...choice,target:'__entry'}),null);
  assert.equal(dialogueConnectionEdgeId(g,{...choice,sourceHandle:'missing'}),null);
  assert.equal(dialogueConnectionEdgeId(g,{...choice,source:'closing'}),null);
  assert.equal(dialogueConnectionEdgeId(g,{source:'__entry',sourceHandle:'default',target:'__end'}),null);
});
