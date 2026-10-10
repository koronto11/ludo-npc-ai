import test from 'node:test';
import assert from 'node:assert/strict';
import {quickDialogueMatches,quickDialogueStructure,quickDialogueTopology} from '../src/quickDialogueModel.js';

const choice=(id,target,text='询问消息')=>({id,target_node_id:target,text,condition:{op:'always'},effects:[]});
const node=(id,options=[])=>({id,label:id,text:'守卫正在检查通行证。',speaker_id:'guard',condition:{op:'always'},effects:[],options});
const fixture=()=>({entry_node_id:'opening',entry_routes:[{node_id:'alternate'}],nodes:[
  node('opening',[choice('go','answer')]),node('answer',[choice('return','opening'),choice('leave',null)]),
  node('alternate',[choice('merge','answer')]),node('unlinked',[choice('missing','removed')]),
]});

test('overview includes every card, handles cycles and merges, and distinguishes disconnected cards',()=>{
  const graph=fixture(),before=structuredClone(graph),view=quickDialogueStructure(graph);
  assert.deepEqual([...view.reachable].sort(),['alternate','answer','opening']);
  assert.deepEqual(Object.keys(view.positions),graph.nodes.map(row=>row.id));
  assert.ok(view.positions.answer.y>view.positions.opening.y);
  assert.equal(view.positions.alternate.y,view.positions.opening.y);
  assert.ok(view.positions.unlinked.y>view.positions.answer.y);
  assert.equal(view.options,5);
  assert.deepEqual(graph,before);
  for(const position of Object.values(view.positions))assert.ok(Number.isFinite(position.x)&&Number.isFinite(position.y));
});

test('overview also lays out legacy graphs without a valid opening and an empty graph',()=>{
  const graph=fixture();graph.entry_node_id='removed';graph.entry_routes=[];
  assert.equal(quickDialogueStructure(graph).reachable.size,0);
  assert.equal(Object.keys(quickDialogueStructure(graph).positions).length,4);
  assert.deepEqual(quickDialogueStructure({entry_node_id:null,entry_routes:[],nodes:[]}).positions,{});
});

test('continuous text search covers titles, speech, speakers and player choices without changing content',()=>{
  const card=node('Opening',[choice('go',null,'Ask about the harbour')]),before=structuredClone(card);
  const actors=[{id:'guard',name:'城门守卫'}];
  for(const query of [' opening ','通行证','城门守卫','HARBOUR',''])assert.ok(quickDialogueMatches(card,actors,query),query);
  assert.equal(quickDialogueMatches(card,actors,'不存在的选项'),false);
  assert.deepEqual(card,before);
});

test('text, speaker and conditions preserve overview camera; actual topology changes invalidate its layout',()=>{
  const graph=fixture(),signature=quickDialogueTopology(graph);
  graph.nodes[0].text='新正文';graph.nodes[0].label='新标题';graph.nodes[0].speaker_id='merchant';
  graph.nodes[0].options[0].text='玩家的新选项';graph.nodes[0].condition={op:'not',condition:{op:'always'}};
  assert.equal(quickDialogueTopology(graph),signature);
  graph.nodes[0].options[0].target_node_id=null;
  assert.notEqual(quickDialogueTopology(graph),signature);
});
