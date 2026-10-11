import test from 'node:test';
import assert from 'node:assert/strict';
import {isDialogueEnding,removeDialogueNode} from '../src/dialogueEndings.js';
import {dialogueEdges} from '../src/dialogueEdges.js';
import {beautifyDialoguePositions,completeDialoguePositions} from '../src/dialogueBeautify.js';
import {quickDialogueTopology,quickDialogueStructure} from '../src/quickDialogueModel.js';

const graph=()=>({entry_node_id:'start',entry_routes:[],nodes:[
  {id:'start',text:'你好',options:[{id:'bye',target_node_id:'friendly'},{id:'no',target_node_id:'refused'},{id:'leave',target_node_id:null}].map(option=>({...option,condition:{op:'always'}}))},
  {id:'friendly',node_type:'ending',label:'告别',text:'路上小心。',options:[]},
  {id:'refused',node_type:'ending',label:'拒绝',text:'走吧。',options:[]},
]});

test('multiple named endings retain their own branch targets and share no outbound choice',()=>{
  const doc=graph(),before=structuredClone(doc),edges=dialogueEdges(doc);
  assert.equal(edges.find(e=>e.id==='option:bye').target,'friendly');
  assert.equal(edges.find(e=>e.id==='option:no').target,'refused');
  assert.equal(edges.find(e=>e.id==='option:leave').target,'__end');
  assert.equal(edges.filter(e=>e.source==='friendly'||e.source==='refused').length,0);
  const positions=completeDialoguePositions(doc,beautifyDialoguePositions(doc));
  assert.ok(positions.friendly.x>positions.start.x);
  assert.ok(positions.friendly.y!==positions.refused.y);
  assert.ok(quickDialogueStructure(doc).reachable.has('friendly'));
  assert.deepEqual(doc,before);
});

test('deleting one ending clears only its references and leaves another ending and default direct exit intact',()=>{
  const doc=graph(),before=structuredClone(doc),patch=removeDialogueNode(doc,'friendly');
  assert.equal(patch.nodes[0].options[0].target_node_id,null);
  assert.equal(patch.nodes[0].options[1].target_node_id,'refused');
  assert.deepEqual(patch.nodes[1],doc.nodes[2]);
  assert.deepEqual(doc,before);
  assert.equal(removeDialogueNode({entry_node_id:'only',entry_routes:[],nodes:[{id:'only',options:[]}]},'only'),null);
});

test('legacy empty-choice cards stay ordinary cards and text changes never reset overview geometry',()=>{
  assert.equal(isDialogueEnding({id:'old',options:[]}),false);
  const doc=graph(),signature=quickDialogueTopology(doc),changed=structuredClone(doc);
  changed.nodes[1].text='新的收尾台词';
  assert.equal(quickDialogueTopology(changed),signature);
  changed.nodes[1].node_type='speech';
  assert.notEqual(quickDialogueTopology(changed),signature);
});
